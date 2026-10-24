// Jenis baris pangkalan data (snake_case seperti dalam Postgres).

export type ExpenseCategory = {
  id: string;
  user_id: string | null;
  name: string;
  icon: string;
  sort_order: number;
};

export type ReceiptStatus = "processing" | "review" | "confirmed" | "failed";
export type ReceiptKind = "receipt" | "statement";
export type Beneficiary = "self" | "spouse" | "child" | "parent";

export type Receipt = {
  id: string;
  user_id: string;
  file_path: string | null;
  file_type: "image" | "pdf" | null;
  merchant: string | null;
  receipt_date: string | null;
  total_amount: number | null;
  ocr_json: unknown;
  status: ReceiptStatus;
  assessment_year: number | null;
  kind: ReceiptKind;
  created_at: string;
  updated_at: string;
};

export type ReceiptItem = {
  id: string;
  receipt_id: string;
  user_id: string;
  name: string;
  quantity: number;
  amount: number;
  tax_category_id: string | null;
  beneficiary: Beneficiary | null;
  ai_suggested: boolean;
  ai_confidence: number | null;
  sort_order: number;
};

export type Expense = {
  id: string;
  user_id: string;
  expense_date: string;
  amount: number;
  merchant: string | null;
  category_id: string | null;
  note: string | null;
  receipt_id: string | null;
  vehicle_id: string | null;
  created_at: string;
};

export type TaxCategoryType = "relief" | "deduction" | "rebate";

export type TaxCategory = {
  id: string;
  assessment_year: number;
  code: string;
  name: string;
  description: string | null;
  cap_amount: number | null;
  parent_id: string | null;
  type: TaxCategoryType;
  allowed_beneficiaries: Beneficiary[];
  keywords: string[];
  proof_type: "receipt" | "statement";
  notes: string | null;
  sort_order: number;
  is_active: boolean;
};

export const BENEFICIARY_LABELS: Record<Beneficiary, string> = {
  self: "Diri",
  spouse: "Pasangan",
  child: "Anak",
  parent: "Ibu bapa",
};

/** Output AI yang disimpan dalam receipts.ocr_json. */
export type ParsedReceipt = {
  merchant: string | null;
  date: string | null;
  total: number | null;
  currency: string | null;
  expense_category: string | null;
  is_zakat: boolean;
  items: {
    name: string;
    quantity: number;
    amount: number;
    tax_category_code: string | null;
    beneficiary_needed: boolean;
    confidence: number;
  }[];
};
