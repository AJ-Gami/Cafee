-- Fasa 2: kategori belanja, resit, item resit, belanja, kiraan scan AI, storage resit

-- ---------------------------------------------------------------------------
-- Kategori belanja (user_id null = kategori sistem)
-- ---------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  icon text not null default 'tag',
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index expense_categories_unique_name
  on public.expense_categories (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create trigger expense_categories_set_updated_at
  before update on public.expense_categories
  for each row execute function public.set_updated_at();

alter table public.expense_categories enable row level security;

create policy "expense_categories_select" on public.expense_categories
  for select to authenticated using (user_id is null or user_id = (select auth.uid()));
create policy "expense_categories_insert_own" on public.expense_categories
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "expense_categories_update_own" on public.expense_categories
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "expense_categories_delete_own" on public.expense_categories
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Resit (termasuk "statement": penyata premium, KWSP, SSPN…)
-- ---------------------------------------------------------------------------
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_path text,
  file_type text check (file_type in ('image', 'pdf')),
  merchant text,
  receipt_date date,
  total_amount numeric(12, 2),
  ocr_json jsonb,
  status text not null default 'processing' check (status in ('processing', 'review', 'confirmed', 'failed')),
  assessment_year int,
  kind text not null default 'receipt' check (kind in ('receipt', 'statement')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index receipts_user_year on public.receipts (user_id, assessment_year);
create index receipts_user_status on public.receipts (user_id, status);

create trigger receipts_set_updated_at
  before update on public.receipts
  for each row execute function public.set_updated_at();

-- Tahun taksiran diambil daripada tahun receipt_date.
create or replace function public.receipts_set_assessment_year()
returns trigger
language plpgsql
as $$
begin
  if new.receipt_date is not null then
    new.assessment_year = extract(year from new.receipt_date)::int;
  elsif new.assessment_year is null then
    new.assessment_year = extract(year from (now() at time zone 'Asia/Kuala_Lumpur'))::int;
  end if;
  return new;
end;
$$;

create trigger receipts_assessment_year
  before insert or update of receipt_date, assessment_year on public.receipts
  for each row execute function public.receipts_set_assessment_year();

alter table public.receipts enable row level security;

create policy "receipts_all_own" on public.receipts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Item resit
-- ---------------------------------------------------------------------------
create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  quantity numeric(10, 2) not null default 1,
  amount numeric(12, 2) not null default 0,
  tax_category_id uuid, -- FK ditambah dalam migrasi Fasa 3
  beneficiary text check (beneficiary in ('self', 'spouse', 'child', 'parent')),
  ai_suggested boolean not null default false,
  ai_confidence numeric(4, 3),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index receipt_items_receipt on public.receipt_items (receipt_id);
create index receipt_items_user_tax on public.receipt_items (user_id, tax_category_id);

create trigger receipt_items_set_updated_at
  before update on public.receipt_items
  for each row execute function public.set_updated_at();

alter table public.receipt_items enable row level security;

create policy "receipt_items_select_own" on public.receipt_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "receipt_items_insert_own" on public.receipt_items
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.receipts r where r.id = receipt_id and r.user_id = (select auth.uid()))
  );
create policy "receipt_items_update_own" on public.receipt_items
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.receipts r where r.id = receipt_id and r.user_id = (select auth.uid()))
  );
create policy "receipt_items_delete_own" on public.receipt_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Belanja
-- ---------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expense_date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  merchant text,
  category_id uuid references public.expense_categories (id) on delete set null,
  note text,
  receipt_id uuid references public.receipts (id) on delete set null,
  vehicle_id uuid, -- FK ditambah dalam migrasi Fasa 5
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_user_date on public.expenses (user_id, expense_date desc);
create index expenses_receipt on public.expenses (receipt_id);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;

-- Rujukan (kategori, resit) mesti milik pengguna sendiri (atau kategori sistem).
create or replace function public.expense_refs_ok(p_category uuid, p_receipt uuid)
returns boolean
language sql
stable
as $$
  select
    (p_category is null or exists (
      select 1 from public.expense_categories c
      where c.id = p_category and (c.user_id is null or c.user_id = auth.uid())
    ))
    and (p_receipt is null or exists (
      select 1 from public.receipts r where r.id = p_receipt and r.user_id = auth.uid()
    ));
$$;

create policy "expenses_select_own" on public.expenses
  for select to authenticated using (user_id = (select auth.uid()));
create policy "expenses_insert_own" on public.expenses
  for insert to authenticated with check (user_id = (select auth.uid()) and public.expense_refs_ok(category_id, receipt_id));
create policy "expenses_update_own" on public.expenses
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.expense_refs_ok(category_id, receipt_id));
create policy "expenses_delete_own" on public.expenses
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Kiraan scan AI sebulan (pantau kos API; had pakej dalam Fasa 7)
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  scan_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

create trigger ai_usage_set_updated_at
  before update on public.ai_usage
  for each row execute function public.set_updated_at();

alter table public.ai_usage enable row level security;

-- Pengguna boleh baca kiraan sendiri. Tulis hanya melalui fungsi di bawah.
create policy "ai_usage_select_own" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.increment_ai_scan()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month text := to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM');
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.ai_usage (user_id, month, scan_count)
  values (auth.uid(), v_month, 1)
  on conflict (user_id, month) do update set scan_count = public.ai_usage.scan_count + 1
  returning scan_count into v_count;
  return v_count;
end;
$$;

revoke all on function public.increment_ai_scan() from public, anon;
grant execute on function public.increment_ai_scan() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket private 'receipts', path {user_id}/{tahun}/{uuid}.{ext}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  15728640, -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

create policy "receipts_storage_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts_storage_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts_storage_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
