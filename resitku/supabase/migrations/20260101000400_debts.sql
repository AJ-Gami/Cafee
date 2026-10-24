-- Fasa 4: hutang (saya berhutang / orang berhutang dengan saya) dan bayaran

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  direction text not null check (direction in ('i_owe', 'owed_to_me')),
  name text not null check (char_length(trim(name)) between 1 and 120),
  whatsapp_number text,
  original_amount numeric(12, 2) not null check (original_amount >= 0),
  current_balance numeric(12, 2) not null,
  min_payment numeric(12, 2) check (min_payment is null or min_payment >= 0),
  term_years numeric(5, 2) check (term_years is null or term_years >= 0),
  interest_rate numeric(6, 3) check (interest_rate is null or interest_rate >= 0),
  note text,
  status text not null default 'active' check (status in ('active', 'paid_off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index debts_user_direction on public.debts (user_id, direction, status);

create trigger debts_set_updated_at
  before update on public.debts
  for each row execute function public.set_updated_at();

-- Status mengikut baki: 'paid_off' bila baki = 0 (atau kurang).
create or replace function public.debts_sync_status()
returns trigger
language plpgsql
as $$
begin
  new.status = case when new.current_balance <= 0 then 'paid_off' else 'active' end;
  return new;
end;
$$;

create trigger debts_sync_status
  before insert or update of current_balance on public.debts
  for each row execute function public.debts_sync_status();

alter table public.debts enable row level security;

create policy "debts_all_own" on public.debts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  paid_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index debt_payments_debt on public.debt_payments (debt_id);
create index debt_payments_user_date on public.debt_payments (user_id, paid_date desc);

create trigger debt_payments_set_updated_at
  before update on public.debt_payments
  for each row execute function public.set_updated_at();

-- Baki hutang dikemas kini setiap kali bayaran dicatat, diubah atau dipadam.
create or replace function public.debt_payments_apply()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.debts set current_balance = current_balance + old.amount where id = old.debt_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.debts set current_balance = current_balance - new.amount where id = new.debt_id;
  end if;
  return null;
end;
$$;

create trigger debt_payments_apply
  after insert or update of amount, debt_id or delete on public.debt_payments
  for each row execute function public.debt_payments_apply();

alter table public.debt_payments enable row level security;

create policy "debt_payments_select_own" on public.debt_payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "debt_payments_insert_own" on public.debt_payments
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.debts d where d.id = debt_id and d.user_id = (select auth.uid()))
  );
create policy "debt_payments_update_own" on public.debt_payments
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.debts d where d.id = debt_id and d.user_id = (select auth.uid()))
  );
create policy "debt_payments_delete_own" on public.debt_payments
  for delete to authenticated using (user_id = (select auth.uid()));
