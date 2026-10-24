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

## Fasa 4 — Hutang

- **Baki dikemas kini oleh trigger DB** (`debt_payments_apply`) bila bayaran dicipta, diubah atau dipadam, dan
  `status` disegerakkan daripada baki (`paid_off` bila baki ≤ 0). Memadam bayaran memulihkan baki.
- Borang bayaran menghalang jumlah melebihi baki.
- **"Dah bayar"** = jumlah bayaran yang dicatat dalam app (untuk *Orang Hutang Saya* dilabel "Dah terima").
- **Streak** = bulan berturut-turut (waktu KL) yang ada sekurang-kurangnya satu bayaran, dikira untuk arah yang
  dipaparkan. Bulan semasa yang belum ada bayaran tidak memutuskan streak sehingga bulan itu berakhir.
- **Susunan snowball** hanya dipaparkan (bernombor) untuk *Hutang Saya*.
- **WhatsApp**: nombor dinormalkan (`012-345 6789` → `60123456789`); mesej peringatan BM yang sopan dengan baki
  semasa dan nama paparan pengguna.

## Fasa 5 — Kenderaan

- **Penyelarasan belanja dibuat oleh trigger DB**: `vehicle_services` / `fuel_logs` mempunyai kolum tambahan
  `expense_id`. Trigger BEFORE INSERT/UPDATE mencipta atau mengemas kini belanja (kategori sistem *Kenderaan* /
  *Minyak*, `vehicle_id` dipautkan); trigger AFTER DELETE memadam belanja itu. Memadam kenderaan memadam semua
  rekodnya (cascade) dan belanja berkaitan.
- `fuel_logs` mempunyai kolum tambahan `station` (nama stesen) yang menjadi "kedai" pada belanja.
- Belanja yang dicipta daripada kenderaan **tidak boleh diedit/dipadam dari tab Belanja**; butirannya memaut ke
  skrin kenderaan.
- **Odometer kenderaan** naik secara automatik kepada bacaan tertinggi daripada servis/log minyak.
- **Purata L/100km** (kaedah tangki penuh): log minyak disusun ikut odometer; liter log pertama tidak dikira kerana
  minyak itu digunakan sebelum julat yang direkod. **Kos per km** = (servis + minyak, tolak isian pertama) ÷ jarak
  antara bacaan odometer terendah dan tertinggi.
- **Peringatan dalam app**: cukai jalan / insurans tamat dalam 30 hari (atau sudah tamat), dan servis seterusnya
  dalam 30 hari atau 1,000 km (atau lewat), berdasarkan rekod servis terkini yang ada sasaran.
- **Snap resit servis/minyak** guna route scan yang sama; hasil AI mengisi kos/jumlah, tarikh, bengkel/stesen
  (dan liter jika dijumpai dalam item). Resit ditanda `confirmed` bila rekod disimpan. Jika borang dibatalkan,
  resit kekal dalam "Resit menunggu semakan" (tiada padam automatik).

## Fasa 6 — Pautan, Profil penuh & kemasan

- **Pratonton pautan** (`/api/links/preview`) memerlukan log masuk (bukan proksi terbuka) dan menghalang SSRF:
  hanya http/https pada port 80/443, tiada `localhost`, dan setiap alamat DNS (termasuk selepas redirect, maks 3)
  mesti IP awam. Hanya bahagian `<head>` dibaca (maks ~600 KB), timeout 5 saat; jika gagal, medan kosong dipulangkan.
  (Risiko baki: *DNS rebinding* antara semakan dan fetch; diterima untuk app satu pengguna.)
- **Share Target** guna `GET /kongsi?title&text&url`; URL diambil daripada `url` atau teks (Android). Laluan ini
  dilindungi log masuk; proxy menyimpan pautan asal dalam `?next=` jika perlu log masuk dahulu.
- **Paparan grid/senarai** disimpan dalam `localStorage` (pilihan per pelayar sahaja).
- **Eksport semua data**: ZIP dengan satu CSV setiap jadual (UTF-8 + BOM supaya Excel membaca BM dengan betul).
  Kategori sistem tidak dieksport; gambar resit dieksport melalui ZIP resit dalam tracker cukai.
- **Import CSV**: templat boleh dimuat turun; tarikh `YYYY-MM-DD` atau `DD/MM/YYYY`; kategori tidak dikenali →
  *Lain-lain*; baris bermasalah dipaparkan merah dalam pratonton dan dilangkau.
- **Kategori sendiri** boleh diurus dari Profil (namakan semula / padam; belanja tidak dipadam).
- **Pengukuhan DB**: semua fungsi ditetapkan `search_path = ''`.
- **Semakan**: RLS diuji pada Postgres tempatan (pengguna B tidak boleh membaca/menulis data pengguna A, termasuk
  rujukan silang seperti item ke resit orang lain). Skrin utama disemak pada lebar 360px tanpa skrol mendatar.
