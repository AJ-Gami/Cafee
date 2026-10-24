-- Fasa 3: kategori pelepasan cukai LHDN, zakat

create table public.tax_relief_categories (
  id uuid primary key default gen_random_uuid(),
  assessment_year int not null check (assessment_year between 2000 and 2100),
  code text not null check (code ~ '^[A-Z0-9_]+$'),
  name text not null,
  description text,
  cap_amount numeric(12, 2) check (cap_amount is null or cap_amount >= 0), -- null = tiada had
  parent_id uuid references public.tax_relief_categories (id) on delete set null,
  type text not null default 'relief' check (type in ('relief', 'deduction', 'rebate')),
  allowed_beneficiaries text[] not null default '{self}'
    check (allowed_beneficiaries <@ array['self', 'spouse', 'child', 'parent']),
  keywords text[] not null default '{}',
  proof_type text not null default 'receipt' check (proof_type in ('receipt', 'statement')),
  notes text,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_year, code)
);

create index tax_relief_categories_year on public.tax_relief_categories (assessment_year, sort_order);

create trigger tax_relief_categories_set_updated_at
  before update on public.tax_relief_categories
  for each row execute function public.set_updated_at();

alter table public.tax_relief_categories enable row level security;

-- Semua pengguna log masuk boleh membaca. Tiada polisi tulis: hanya service role (route admin
-- yang menyemak ADMIN_EMAILS) boleh mengubah kategori.
create policy "tax_relief_categories_read" on public.tax_relief_categories
  for select to authenticated using (true);

-- Sambung item resit kepada kategori cukai.
alter table public.receipt_items
  add constraint receipt_items_tax_category_fk
  foreign key (tax_category_id) references public.tax_relief_categories (id) on delete set null;

-- Salin semua kategori ke tahun taksiran baharu (contohnya YA 2027 bila Bajet diluluskan).
create or replace function public.copy_tax_categories(p_from int, p_to int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_from = p_to then
    raise exception 'Tahun sumber dan sasaran sama';
  end if;
  if exists (select 1 from public.tax_relief_categories where assessment_year = p_to) then
    raise exception 'Tahun taksiran % sudah mempunyai kategori', p_to;
  end if;

  create temp table if not exists pg_temp.tax_copy_map (old_id uuid, new_id uuid) on commit drop;
  delete from pg_temp.tax_copy_map;
  insert into pg_temp.tax_copy_map (old_id, new_id)
  select id, gen_random_uuid() from public.tax_relief_categories where assessment_year = p_from;

  insert into public.tax_relief_categories (
    id, assessment_year, code, name, description, cap_amount, parent_id, type,
    allowed_beneficiaries, keywords, proof_type, notes, sort_order, is_active
  )
  select
    m.new_id, p_to, c.code, c.name, c.description, c.cap_amount, pm.new_id, c.type,
    c.allowed_beneficiaries, c.keywords, c.proof_type, c.notes, c.sort_order, c.is_active
  from public.tax_relief_categories c
  join pg_temp.tax_copy_map m on m.old_id = c.id
  left join pg_temp.tax_copy_map pm on pm.old_id = c.parent_id
  where c.assessment_year = p_from;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.copy_tax_categories(int, int) from public, anon, authenticated;
grant execute on function public.copy_tax_categories(int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Zakat & fitrah (rebat cukai)
-- ---------------------------------------------------------------------------
create table public.zakat_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  paid_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  type text not null default 'zakat' check (type in ('zakat', 'fitrah')),
  institution text,
  receipt_id uuid references public.receipts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index zakat_payments_user_date on public.zakat_payments (user_id, paid_date);

create trigger zakat_payments_set_updated_at
  before update on public.zakat_payments
  for each row execute function public.set_updated_at();

alter table public.zakat_payments enable row level security;

create policy "zakat_payments_select_own" on public.zakat_payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "zakat_payments_insert_own" on public.zakat_payments
  for insert to authenticated with check (user_id = (select auth.uid()) and public.expense_refs_ok(null, receipt_id));
create policy "zakat_payments_update_own" on public.zakat_payments
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.expense_refs_ok(null, receipt_id));
create policy "zakat_payments_delete_own" on public.zakat_payments
  for delete to authenticated using (user_id = (select auth.uid()));
