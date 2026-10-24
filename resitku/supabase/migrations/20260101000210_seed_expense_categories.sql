-- Fasa 2 (seed): kategori belanja sistem. Ikon = nama ikon lucide.
insert into public.expense_categories (user_id, name, icon, sort_order) values
  (null, 'Makan & Minum', 'utensils', 10),
  (null, 'Barang Dapur', 'shopping-basket', 20),
  (null, 'Minyak', 'fuel', 30),
  (null, 'Kenderaan', 'car', 40),
  (null, 'Bil & Utiliti', 'zap', 50),
  (null, 'Kesihatan', 'heart-pulse', 60),
  (null, 'Pendidikan', 'graduation-cap', 70),
  (null, 'Buku', 'book-open', 80),
  (null, 'Gajet & Elektronik', 'smartphone', 90),
  (null, 'Sukan', 'dumbbell', 100),
  (null, 'Pakaian', 'shirt', 110),
  (null, 'Rumah', 'house', 120),
  (null, 'Keluarga & Anak', 'baby', 130),
  (null, 'Derma & Zakat', 'hand-heart', 140),
  (null, 'Hiburan & Pelancongan', 'plane', 150),
  (null, 'Insurans & Simpanan', 'shield-check', 160),
  (null, 'Lain-lain', 'tag', 999)
on conflict do nothing;
