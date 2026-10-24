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
