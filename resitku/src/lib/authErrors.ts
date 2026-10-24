/** Terjemah mesej ralat Supabase Auth kepada BM. */
export function authErrorBM(message: string | undefined | null): string {
  const m = (message ?? "").toLowerCase();
  if (!m) return "Ralat tidak diketahui. Cuba lagi.";
  if (m.includes("invalid login credentials")) return "Email atau kata laluan salah.";
  if (m.includes("email not confirmed")) return "Email belum disahkan. Semak peti masuk anda.";
  if (m.includes("user already registered") || m.includes("already been registered")) return "Email ini sudah didaftarkan. Sila log masuk.";
  if (m.includes("password should be at least") || m.includes("weak password")) return "Kata laluan terlalu lemah. Guna sekurang-kurangnya 8 aksara.";
  if (m.includes("same password") || m.includes("different from the old")) return "Kata laluan baharu mesti berbeza daripada yang lama.";
  if (m.includes("rate limit") || m.includes("too many")) return "Terlalu banyak cubaan. Tunggu sebentar dan cuba lagi.";
  if (m.includes("invalid email") || m.includes("unable to validate email")) return "Format email tidak sah.";
  if (m.includes("expired") || m.includes("invalid") && m.includes("link")) return "Pautan sudah tamat tempoh atau tidak sah. Minta pautan baharu.";
  if (m.includes("session") && m.includes("missing")) return "Sesi tidak dijumpai. Buka semula pautan dari email anda.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Tiada sambungan internet. Cuba lagi.";
  if (m.includes("provider is not enabled")) return "Log masuk Google belum diaktifkan dalam Supabase.";
  return message ?? "Ralat tidak diketahui.";
}
