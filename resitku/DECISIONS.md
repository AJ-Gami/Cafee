# Keputusan reka bentuk ResitKu

Keputusan yang dibuat semasa pembinaan, bila prompt tidak menetapkan secara terperinci.

## Umum

- **Lokasi projek**: repo `Cafee` sudah mengandungi permainan Vite (Café Empire). Supaya tiada apa-apa dipadam,
  ResitKu dibina dalam folder `resitku/`. Di Vercel, tetapkan *Root Directory* = `resitku`.
- **Next.js 16.4** (App Router) dengan `cacheComponents: false`. App ini kebanyakannya komponen klien yang membaca
  Supabase terus (dilindungi RLS), jadi model caching lama lebih ringkas dan tiada risiko data pengguna di-cache.
- **Proxy** (`src/proxy.ts`, nama baharu untuk middleware dalam Next 16) menyegarkan sesi Supabase dan
  mengalihkan pelawat yang belum log masuk ke `/log-masuk`.
- **Laluan dalam BM**: `/log-masuk`, `/daftar`, `/lupa-kata-laluan`, `/set-semula-kata-laluan`, `/belanja`, `/hutang`,
  `/kenderaan`, `/profil`, `/pautan`, `/admin/cukai`.
- **Fon**: fon sistem (tiada muat turun Google Fonts semasa build) supaya build tidak bergantung pada rangkaian.
- **Service worker** ditulis sendiri (`public/sw.js`) dan bukannya `@serwist/next`: Serwist memerlukan webpack,
  sedangkan Next 16 membina dengan Turbopack. SW hanya cache aset statik dan halaman `/offline`; data pengguna dan
  `/api` tidak pernah di-cache. SW didaftar dalam production sahaja.
- **Profil**: kolum `plan` dan `plan_expires_at` dikunci oleh trigger; hanya `service_role` boleh mengubahnya
  (supaya pengguna tidak boleh "naik taraf" sendiri melalui API bila Fasa 7 dibina).
- **Pengurusan data**: komponen klien menggunakan hook kecil `useData()` (tiada React Query) untuk kekal ringan.

## Fasa 2 — Belanja + Resit

- **`user_id default auth.uid()`** pada jadual pengguna, ditambah polisi RLS `with check (user_id = auth.uid())`.
  Klien masih menghantar `user_id` secara eksplisit.
- **Integriti rujukan dalam RLS**: item resit hanya boleh dipautkan ke resit sendiri; belanja hanya boleh merujuk
  kategori sistem/sendiri dan resit sendiri (fungsi `expense_refs_ok`).
- **`assessment_year`** diisi oleh trigger daripada tahun `receipt_date` (atau tahun semasa KL jika tarikh belum ada).
- **`file_path` boleh null**: tuntutan manual (penyata) tanpa dokumen dilampirkan tidak mempunyai fail.
- **Item resit dicipta semasa scan** (dengan `ai_suggested` + `ai_confidence`) supaya skrin semakan sentiasa membaca
  daripada `receipt_items`. Semasa Simpan, item ditulis semula; `ai_suggested` kekal `true` hanya jika pengguna tidak
  menukar kategori cukai yang dicadangkan AI.
- **Output berstruktur**: route scan guna `messages.parse()` + `output_config.format` (skema Zod) dan bukannya
  tool use paksa, supaya JSON sentiasa sah dan sama untuk apa-apa model dalam `RECEIPT_AI_MODEL`. Kod cukai dan
  kategori belanja dihadkan sebagai `enum` daripada senarai semasa dalam DB.
- **Imbas automatik** hanya berlaku sekali bila skrin semakan dibuka terus dari aliran snap (`?imbas=1`). Resit yang
  tersekat dalam `processing` boleh dibaca semula secara manual (elak caj API berganda).
- **Gambar dimampatkan** di browser kepada JPEG, sisi panjang 1600px. HEIC yang tidak dapat ditukar dimuat naik asal;
  AI akan menolak format itu dan pengguna boleh isi manual.
- **Padam**: tiada padam automatik. Memadam belanja yang ada resit menawarkan kotak semak "Padam juga resit" (tidak
  ditanda secara lalai) dengan amaran LHDN 7 tahun. Skrin semakan resit juga ada butang Padam dengan amaran yang sama.
- **Kiraan `ai_usage`** hanya boleh ditulis melalui fungsi `increment_ai_scan()` (security definer), supaya pengguna
  tidak boleh menetapkan semula kiraan sendiri bila had Fasa 7 dikuatkuasakan.
- **Carta Laporan**: palet kategori tetap 8 warna (disahkan untuk buta warna); kategori ke-9 dan seterusnya digabung
  sebagai "Lain-lain". Warna mengikut susunan kategori, bukan kedudukan, supaya kekal stabil.

## Fasa 3 — Cukai

- **Kiraan had**: sub-had dikira dalam had induk menggunakan jumlah sub-had yang *boleh dituntut* (selepas had sub).
  Contoh: vaksin RM1,500 (had RM1,000) menyumbang RM1,000 kepada Perubatan. Lebihan dipaparkan pada kad sub-had.
  Item boleh juga ditanda terus pada kategori induk.
- **"Boleh dituntut setakat ini"** (Home + tracker) = jumlah pelepasan (relief) selepas had. Potongan dan rebat
  dipaparkan berasingan.
- **Zakat** direkod dalam `zakat_payments` sahaja (bukan sebagai item bertanda ZAKAT), supaya tiada kiraan berganda.
  Kategori ZAKAT tidak muncul dalam dropdown item; kadnya dalam tracker menjumlahkan `zakat_payments`.
  Resit yang AI tanda `is_zakat` memaparkan kotak "Rekod sebagai zakat" (ditanda secara lalai) dalam skrin semakan.
  Rekod zakat manual tidak mencipta belanja.
- **Tuntutan manual** mencipta `receipts` (`kind = statement`, terus `confirmed`) + satu `receipt_items`, tanpa rekod
  belanja (contohnya caruman KWSP bukan belanja harian).
- **Eksport** dijana di klien: `jspdf` + `jspdf-autotable` (PDF) dan `jszip` (ZIP, fail diambil melalui signed URL,
  4 muat turun serentak). Resit yang mempunyai item dalam beberapa kategori disalin ke setiap folder kategori; resit
  tanpa kategori cukai masuk folder "Tiada kategori cukai".
- **Admin**: `tax_relief_categories` boleh dibaca semua pengguna log masuk; tiada polisi tulis. Route
  `/api/admin/tax-categories` (PATCH/POST) dan `/copy` menyemak `ADMIN_EMAILS` kemudian menulis dengan service role.
  "Salin ke tahun baru" guna fungsi SQL `copy_tax_categories()` (atomik, memetakan semula `parent_id`), yang hanya
  boleh dilaksanakan oleh `service_role`. Admin juga boleh menambah kategori baharu.
- **Home**: butang + terus membuka kamera (snap resit). Kad Cukai memaparkan 3 kategori dengan peratus penggunaan
  tertinggi.
