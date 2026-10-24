"use client";

/** Muat turun Blob sebagai fail. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Nama fail/folder yang selamat. */
export function safeName(input: string, max = 60): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[^\w\s&().-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max) || "tanpa-nama"
  );
}
