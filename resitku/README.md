# ResitKu

PWA mobile-first untuk catat belanja harian, snap resit dan menjejak pelepasan cukai LHDN (Malaysia),
dengan modul Hutang, Kenderaan dan Pautan.

**Stack**: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres, Storage, RLS) ·
Anthropic Claude API (baca resit) · Vercel.

## Ciri

| Modul | Ringkasan |
|---|---|
| **Auth** | Email + kata laluan, Google, lupa / set semula kata laluan |
| **Belanja** | Snap resit (kamera), galeri / PDF, tambah manual; AI baca kedai, tarikh, jumlah, item dan cadangkan kategori cukai; senarai bulanan, carian, tapisan; Laporan (carta kategori, trend 6 bulan) |
| **Cukai** | Tracker pelepasan YA (had, baki, sub-had, lebihan), tuntutan manual (penyata), zakat sebagai rebat, eksport PDF ringkasan & ZIP resit, skrin admin `/admin/cukai` |
| **Hutang** | Hutang Saya / Orang Hutang Saya, catat bayaran (baki auto), streak, susunan snowball, peringatan WhatsApp |
| **Kenderaan** | Kad kenderaan, servis & isi minyak (auto jadi belanja), kos per km, L/100km, peringatan cukai jalan / insurans / servis |
| **Pautan** | Simpan pautan dengan pratonton (Peek), folder, kegemaran, grid/senarai, kongsi terus dari app lain (Web Share Target) |
| **Profil** | Nama, kata laluan, pakej (Percuma), kategori sendiri, eksport semua data (ZIP CSV), import CSV belanja/hutang |

## Struktur

```
resitku/
├── src/
│   ├── app/
│   │   ├── (auth)/              # log-masuk, daftar, lupa & set semula kata laluan
│   │   ├── (app)/               # skrin selepas log masuk (nav bawah 5 tab)
│   │   │   ├── belanja/         # senarai, laporan, cukai, resit/[id], cukai/[id]
│   │   │   ├── hutang/  kenderaan/  pautan/  profil/  kongsi/  admin/cukai/
│   │   ├── api/
│   │   │   ├── receipts/scan    # POST: AI baca resit
│   │   │   ├── links/preview    # GET: og:title/description/image
│   │   │   └── admin/tax-categories(/copy)
│   │   ├── auth/callback/       # OAuth Google & pautan email
│   │   └── manifest.ts          # PWA + share_target
│   ├── components/              # UI boleh guna semula (bottom sheet, toast, FAB…) + modul
│   ├── hooks/                   # useData, useLocalPref
│   ├── lib/
│   │   ├── ai/receiptParser.ts  # SEMUA logik AI (tukar model/penyedia di sini)
│   │   ├── limits.ts            # canUse() — titik masuk had pakej Fasa 7
│   │   ├── supabase/            # klien browser, server, service role
│   │   └── tax.ts, debts.ts, vehicles.ts, links.ts, export/…
│   └── proxy.ts                 # segarkan sesi + lindungi laluan
├── supabase/migrations/         # skema, RLS, trigger, seed (ikut susunan nama fail)
├── public/                      # ikon PWA, service worker (sw.js)
├── DECISIONS.md                 # keputusan reka bentuk
└── .env.example
```

## Setup tempatan

```bash
cd resitku
cp .env.example .env.local   # isi nilai (lihat di bawah)
npm install
npm run dev                  # http://localhost:3000
```

Semakan sebelum commit: `npm run lint` dan `npm run build`.

## Env vars

| Nama | Di mana | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | klien + server | URL projek Supabase (Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | klien + server | Kunci `anon` / publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | **server sahaja** | Diperlukan oleh skrin admin kategori cukai sahaja |
| `ANTHROPIC_API_KEY` | **server sahaja** | Kunci API Anthropic untuk baca resit |
| `RECEIPT_AI_MODEL` | server | Model Claude untuk baca resit. Default `claude-haiku-5-5` |
| `ADMIN_EMAILS` | server | Email admin (dipisahkan koma) yang boleh buka `/admin/cukai` |

Kunci server tidak pernah dihantar ke browser: semua panggilan AI dan admin dibuat dalam route handler.

## Setup Supabase

1. **Cipta projek** di <https://supabase.com/dashboard>. Pilih region Singapura (`ap-southeast-1`).
2. **Jalankan migrasi** dalam `supabase/migrations/` mengikut susunan nama fail:
   - **Supabase CLI** (disyorkan):
     ```bash
     npx supabase login
     npx supabase link --project-ref <project-ref>
     npx supabase db push
     ```
   - atau **SQL Editor**: buka setiap fail mengikut susunan, tampal dan *Run*.

   Migrasi mencipta semua jadual + RLS, trigger, **bucket storage private `receipts`** beserta polisinya, dan seed
   (17 kategori belanja, kategori cukai YA 2026). Semak di *Storage* bahawa bucket `receipts` wujud dan **tidak** public.
3. **Auth → URL Configuration**:
   - *Site URL*: `https://<domain-vercel-anda>`
   - *Redirect URLs*: `https://<domain-vercel-anda>/auth/callback` dan `http://localhost:3000/auth/callback`
4. **Auth → Providers → Email**: biarkan aktif. "Confirm email" boleh dihidupkan (pautan pengesahan dibawa ke
   `/auth/callback`).
5. **Google OAuth**:
   1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → *Create credentials* →
      *OAuth client ID* → *Web application* (lengkapkan *OAuth consent screen* dahulu jika diminta).
   2. *Authorized JavaScript origins*: `https://<domain-vercel-anda>` dan `http://localhost:3000`.
   3. *Authorized redirect URIs*: `https://<project-ref>.supabase.co/auth/v1/callback`
   4. Salin *Client ID* dan *Client secret* ke Supabase → Auth → Providers → Google, kemudian aktifkan.

## Admin kategori cukai

- Email dalam `ADMIN_EMAILS` melihat pautan **Admin kategori cukai** dalam Profil (`/admin/cukai`).
- Perlu `SUPABASE_SERVICE_ROLE_KEY` di pelayan (route admin menulis dengan service role selepas menyemak email).
- Seed YA 2026 berdasarkan ringkasan pihak ketiga. Bila borang BE rasmi / Bajet 2027 diterbitkan:
  1. Kemas kini had/nota YA 2026 jika perlu.
  2. **Salin ke tahun baru** → YA 2027, kemudian ubah had mengikut Bajet.

## Deploy ke Vercel

1. Import repo ini di Vercel.
2. **Root Directory**: `resitku` (repo ini juga mengandungi projek lain di akar).
3. Framework: Next.js (dikesan automatik). Tiada arahan build khas.
4. Tambah semua env vars di atas (Production + Preview).
5. Deploy, kemudian kemas kini *Site URL* / *Redirect URLs* di Supabase dan *origins* Google dengan domain Vercel.
6. Route scan AI menetapkan `maxDuration = 60` saat (cukup untuk pelan Hobby).

## PWA

- Manifest: `src/app/manifest.ts` (warna tema kuning `#FFD43B`, ikon dalam `public/icons/`, `share_target` ke `/kongsi`).
- Service worker: `public/sw.js` (production sahaja): cache aset statik + halaman `/offline`; data tidak di-cache.
- Telefon: buka app → *Add to Home Screen*. Selepas dipasang, ResitKu muncul dalam menu *Kongsi* Android untuk pautan.

## Fasa 7 (belum dibina)

Persediaan sudah ada: `profiles.plan` / `plan_expires_at` (dikunci daripada diubah pengguna), `lib/limits.ts → canUse()`
(kini sentiasa `true`, dipanggil sebelum scan resit, tambah hutang, tambah kenderaan dan simpan pautan), dan jadual
`ai_usage` (kiraan scan AI sebulan, ditulis melalui `increment_ai_scan()`).
