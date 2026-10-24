export const TZ = "Asia/Kuala_Lumpur";

const rm = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** RM 1,234.50 (nombor negatif: -RM 12.00). */
export function formatRM(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe < 0 ? "-" : ""}RM ${rm.format(Math.abs(safe))}`;
}

/** RM 1,240 tanpa sen jika nombor bulat (untuk toast dan label ringkas). */
export function formatRMShort(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (Number.isInteger(n)) return `RM ${new Intl.NumberFormat("en-MY").format(n)}`;
  return formatRM(n);
}

/** '2026-10-24' -> '24/10/2026'. Menerima juga ISO timestamp (ditukar ke waktu KL). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "–";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    date,
  );
}

/** Tarikh hari ini di Kuala Lumpur, format YYYY-MM-DD. */
export function todayKL(): string {
  return toDateKL(new Date());
}

export function toDateKL(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date,
  );
  return parts; // en-CA memberi YYYY-MM-DD
}

/** Bulan semasa di KL, format YYYY-MM. */
export function currentMonthKL(): string {
  return todayKL().slice(0, 7);
}

export function currentYearKL(): number {
  return Number(todayKL().slice(0, 4));
}

export const MONTHS_BM = [
  "Januari",
  "Februari",
  "Mac",
  "April",
  "Mei",
  "Jun",
  "Julai",
  "Ogos",
  "September",
  "Oktober",
  "November",
  "Disember",
];

export const MONTHS_BM_SHORT = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];

/** '2026-10' -> 'Oktober 2026'. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_BM[(m ?? 1) - 1]} ${y}`;
}

export function monthLabelShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_BM_SHORT[(m ?? 1) - 1]} ${String(y).slice(2)}`;
}

/** Tambah/tolak bulan pada kunci 'YYYY-MM'. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = (y ?? 0) * 12 + ((m ?? 1) - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Julat tarikh [mula, akhir) untuk satu bulan: ['2026-10-01', '2026-11-01']. */
export function monthRange(month: string): [string, string] {
  return [`${month}-01`, `${addMonths(month, 1)}-01`];
}

/** Bilangan hari dari hari ini (KL) ke tarikh tertentu. Negatif = sudah lepas. */
export function daysUntil(date: string): number {
  const today = Date.parse(`${todayKL()}T00:00:00Z`);
  const target = Date.parse(`${date}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

/** Parse input wang ('1,234.50' / '12') kepada nombor, atau null. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Salam ikut waktu KL. */
export function greetingKL(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));
  if (hour < 12) return "Selamat pagi";
  if (hour < 15) return "Selamat tengah hari";
  if (hour < 19) return "Selamat petang";
  return "Selamat malam";
}
