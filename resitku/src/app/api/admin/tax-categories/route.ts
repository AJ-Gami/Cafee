import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminGuard";

const beneficiaries = z.array(z.enum(["self", "spouse", "child", "parent"])).min(1);

const fields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable(),
  cap_amount: z.number().min(0).nullable(),
  parent_id: z.uuid().nullable(),
  type: z.enum(["relief", "deduction", "rebate"]),
  allowed_beneficiaries: beneficiaries,
  keywords: z.array(z.string().trim().min(1).max(80)).max(60),
  proof_type: z.enum(["receipt", "statement"]),
  notes: z.string().trim().max(1000).nullable(),
  sort_order: z.number().int(),
  is_active: z.boolean(),
};

const updateSchema = z.object({ id: z.uuid(), ...fields }).partial().required({ id: true });
const createSchema = z.object({
  assessment_year: z.number().int().min(2000).max(2100),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]+$/, "Kod mesti huruf besar, nombor atau _"),
  ...fields,
});

function badRequest(err: z.ZodError) {
  return NextResponse.json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
}

/** PATCH: kemas kini kategori cukai (had, kata kunci, nota, aktif…). */
export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { id, ...patch } = parsed.data;
  if (patch.parent_id === id) return NextResponse.json({ error: "Kategori tidak boleh menjadi induk kepada dirinya." }, { status: 400 });
  const { data, error } = await guard.admin.from("tax_relief_categories").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ category: data });
}

/** POST: tambah kategori baharu untuk satu tahun taksiran. */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { data, error } = await guard.admin.from("tax_relief_categories").insert(parsed.data).select().single();
  if (error) {
    const msg = error.code === "23505" ? "Kod ini sudah wujud untuk tahun tersebut." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ category: data });
}
