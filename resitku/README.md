# ResitKu

PWA mobile-first untuk catat belanja harian, snap resit dan menjejak pelepasan cukai LHDN (Malaysia),
dengan modul Hutang, Kenderaan dan Pautan.

**Stack**: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres, Storage, RLS) ·
Anthropic Claude API (baca resit) · Vercel.

## Struktur

```
resitku/
├── src/
│   ├── app/                 # Laluan App Router
│   │   ├── (auth)/          # log masuk, daftar, lupa & set semula kata laluan
│   │   ├── (app)/           # skrin selepas log masuk (nav bawah 5 tab)
│   │   ├── api/             # route handler server (AI, pratonton pautan, admin)
│   │   └── auth/callback/   # sasaran OAuth Google & pautan email
│   ├── components/          # komponen UI boleh guna semula (bottom sheet, toast, FAB…)
│   ├── hooks/               # useData dan lain-lain
│   ├── lib/                 # klien Supabase, format wang/tarikh, AI, had pakej
│   └── proxy.ts             # segarkan sesi + lindungi laluan
├── supabase/migrations/     # semua migrasi SQL (skema, RLS, seed)
├── public/                  # ikon PWA, service worker
├── DECISIONS.md             # keputusan reka bentuk
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

1. **Cipta projek** di <https://supabase.com/dashboard>. Pilih region Singapura (`ap-southeast-1`) untuk kependaman rendah.
2. **Jalankan migrasi** dalam `supabase/migrations/` mengikut susunan nama fail. Dua cara:
   - **Supabase CLI** (disyorkan):
     ```bash
     npx supabase login
     npx supabase link --project-ref <project-ref>
     npx supabase db push
     ```
   - **SQL Editor**: buka setiap fail mengikut susunan, tampal dan *Run*.
3. **Auth → URL Configuration**:
   - *Site URL*: `https://<domain-vercel-anda>`
   - *Redirect URLs*: tambah `https://<domain-vercel-anda>/auth/callback` dan `http://localhost:3000/auth/callback`
4. **Auth → Providers → Email**: biarkan aktif. "Confirm email" boleh dihidupkan (pengguna akan menerima pautan
   pengesahan yang membawa ke `/auth/callback`).
5. **Google OAuth**:
   1. Di [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → *Create credentials* →
      *OAuth client ID* → jenis *Web application*.
   2. *Authorized JavaScript origins*: `https://<domain-vercel-anda>` dan `http://localhost:3000`.
   3. *Authorized redirect URIs*: `https://<project-ref>.supabase.co/auth/v1/callback`
   4. Salin *Client ID* dan *Client secret* ke Supabase → Auth → Providers → Google, kemudian aktifkan.

## Deploy ke Vercel

1. Import repo ini di Vercel.
2. **Root Directory**: `resitku` (repo ini juga mengandungi projek lain di akar).
3. Framework: Next.js (dikesan automatik). Tiada arahan build khas.
4. Tambah semua env vars di atas (Production + Preview).
5. Deploy, kemudian kemas kini *Site URL* dan *Redirect URLs* di Supabase dengan domain Vercel.

## PWA

- Manifest: `src/app/manifest.ts` (warna tema kuning `#FFD43B`, ikon dalam `public/icons/`).
- Service worker: `public/sw.js` (didaftar dalam production). Buka app di telefon → *Add to Home Screen*.
