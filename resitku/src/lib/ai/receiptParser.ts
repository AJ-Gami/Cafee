import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ParsedReceipt } from "@/lib/types";

/**
 * Logik AI membaca resit. Semua butiran penyedia (Anthropic) terkandung dalam fail ini supaya
 * model atau penyedia boleh ditukar kemudian tanpa mengubah route scan.
 */

export type TaxCategoryHint = {
  code: string;
  name: string;
  description: string | null;
  keywords: string[];
  allowed_beneficiaries: string[];
  notes: string | null;
};

export type ParseReceiptInput = {
  file: Buffer;
  mediaType: string;
  assessmentYear: number;
  taxCategories: TaxCategoryHint[];
  expenseCategories: string[];
};

export type ParseReceiptResult = {
  receipt: ParsedReceipt;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

export class ReceiptParseError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
  }
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export function receiptModel(): string {
  return process.env.RECEIPT_AI_MODEL?.trim() || "claude-haiku-5-5";
}

function buildSchema(taxCodes: string[], expenseCategories: string[]) {
  const taxCode = taxCodes.length > 0 ? z.enum(taxCodes as [string, ...string[]]).nullable() : z.null();
  const category = expenseCategories.length > 0 ? z.enum(expenseCategories as [string, ...string[]]) : z.string();
  return z.object({
    merchant: z.string().nullable().describe("Nama kedai/syarikat seperti tertera pada resit"),
    date: z.string().nullable().describe("Tarikh resit dalam format YYYY-MM-DD, atau null jika tidak jelas"),
    total: z.number().nullable().describe("Jumlah akhir yang dibayar (selepas diskaun, cukai dan pembundaran)"),
    currency: z.string().nullable().describe("Kod mata wang ISO, biasanya MYR"),
    expense_category: category.describe("Kategori belanja yang paling sesuai untuk keseluruhan resit"),
    is_zakat: z.boolean().describe("true jika ini resit bayaran zakat atau fitrah"),
    items: z.array(
      z.object({
        name: z.string(),
        quantity: z.number(),
        amount: z.number().describe("Jumlah harga baris ini (kuantiti x harga seunit)"),
        tax_category_code: taxCode.describe("Kod kategori pelepasan cukai LHDN, atau null jika tidak layak"),
        beneficiary_needed: z.boolean().describe("true jika kategori cukai memerlukan pengguna memilih penerima"),
        confidence: z.number().describe("Keyakinan 0.0 hingga 1.0 bagi kod cukai yang dicadangkan"),
      }),
    ),
  });
}

function buildPrompt(input: ParseReceiptInput): string {
  const taxList = input.taxCategories.length
    ? input.taxCategories
        .map((c) => {
          const parts = [`- ${c.code}: ${c.name}`];
          if (c.description) parts.push(`  Penerangan: ${c.description}`);
          if (c.keywords.length) parts.push(`  Kata kunci: ${c.keywords.join(", ")}`);
          if (c.notes) parts.push(`  Nota: ${c.notes}`);
          if (c.allowed_beneficiaries.length) parts.push(`  Penerima dibenarkan: ${c.allowed_beneficiaries.join(", ")}`);
          return parts.join("\n");
        })
        .join("\n")
    : "(tiada kategori cukai — sentiasa guna null)";

  return [
    "Anda membaca resit atau invois dari Malaysia untuk app catatan belanja peribadi.",
    "Ekstrak maklumat ke dalam skema JSON yang diberi. Peraturan:",
    "- Salin nama item seperti tertera pada resit (boleh pendekkan singkatan yang jelas). Abaikan baris subjumlah, cukai SST, caj perkhidmatan, pembundaran dan bayaran tunai/baki sebagai item.",
    "- `total` ialah jumlah akhir yang dibayar. Jika tidak jelas, gunakan jumlah item.",
    "- Tarikh resit Malaysia biasanya DD/MM/YYYY. Tukar kepada YYYY-MM-DD.",
    "- Jika resit tiada senarai item (contohnya bil atau invois ringkas), cipta satu item yang mewakili keseluruhan resit.",
    `- Untuk setiap item, cadangkan kod kategori pelepasan cukai LHDN bagi tahun taksiran ${input.assessmentYear} HANYA jika item itu jelas layak. Jika ragu-ragu, guna null. Makanan, barang dapur, minyak kenderaan dan pakaian biasanya TIDAK layak.`,
    "- `confidence` ialah keyakinan anda terhadap kod cukai itu (0.0–1.0). Guna 0 jika kod null.",
    "- `beneficiary_needed` = true jika kategori cukai itu membenarkan lebih daripada satu penerima (contohnya diri, pasangan, anak).",
    "- `is_zakat` = true hanya untuk resit pembayaran zakat atau fitrah kepada pusat zakat/majlis agama.",
    "",
    `Kategori pelepasan cukai (tahun taksiran ${input.assessmentYear}):`,
    taxList,
    "",
    `Kategori belanja: ${input.expenseCategories.join(", ")}`,
  ].join("\n");
}

export async function parseReceipt(input: ParseReceiptInput): Promise<ParseReceiptResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ReceiptParseError("ANTHROPIC_API_KEY missing", "Kunci API AI belum ditetapkan di pelayan.");
  }

  const isPdf = input.mediaType === "application/pdf";
  if (!isPdf && !IMAGE_TYPES.includes(input.mediaType as ImageType)) {
    throw new ReceiptParseError(
      `unsupported media type ${input.mediaType}`,
      "Format fail ini tidak disokong. Guna JPG, PNG, WEBP atau PDF.",
    );
  }

  const data = input.file.toString("base64");
  const fileBlock: Anthropic.ContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: input.mediaType as ImageType, data } };

  const schema = buildSchema(
    input.taxCategories.map((c) => c.code),
    input.expenseCategories,
  );
  const model = receiptModel();
  const client = new Anthropic();

  let response;
  try {
    response = await client.messages.parse(
      {
        model,
        max_tokens: 16000,
        system: buildPrompt(input),
        messages: [
          {
            role: "user",
            content: [fileBlock, { type: "text", text: "Baca resit ini dan pulangkan JSON mengikut skema." }],
          },
        ],
        output_config: { format: zodOutputFormat(schema) },
      },
      { timeout: 55_000, maxRetries: 1 },
    );
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new ReceiptParseError(err.message, "Perkhidmatan AI sibuk. Cuba lagi sebentar.");
    }
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ReceiptParseError(err.message, "Kunci API AI tidak sah. Semak tetapan pelayan.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new ReceiptParseError(err.message, "AI tidak dapat memproses fail ini.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new ReceiptParseError(err.message, "Perkhidmatan AI menghadapi masalah. Cuba lagi.");
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new ReceiptParseError("refusal", "AI tidak dapat membaca fail ini.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ReceiptParseError("max_tokens", "Resit terlalu panjang untuk dibaca sekaligus.");
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    throw new ReceiptParseError("no parsed output", "AI tidak memulangkan data yang sah.");
  }

  const receipt: ParsedReceipt = {
    merchant: parsed.merchant?.trim() || null,
    date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) && !Number.isNaN(Date.parse(parsed.date)) ? parsed.date : null,
    total: typeof parsed.total === "number" && Number.isFinite(parsed.total) ? Math.round(parsed.total * 100) / 100 : null,
    currency: parsed.currency ?? "MYR",
    expense_category: parsed.expense_category ?? null,
    is_zakat: Boolean(parsed.is_zakat),
    items: parsed.items.map((item) => ({
      name: item.name.trim(),
      quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
      amount: Number.isFinite(item.amount) ? Math.round(item.amount * 100) / 100 : 0,
      tax_category_code: item.tax_category_code ?? null,
      beneficiary_needed: Boolean(item.beneficiary_needed),
      confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0)),
    })),
  };

  return {
    receipt,
    model: response.model,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}
