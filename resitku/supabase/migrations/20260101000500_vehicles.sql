-- Fasa 5: kenderaan, servis, log minyak. Setiap servis / isi minyak mencipta belanja secara automatik.

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  plate_number text,
  color text not null default '#15803d' check (color ~ '^#[0-9a-fA-F]{6}$'),
  current_odometer int check (current_odometer is null or current_odometer >= 0),
  road_tax_expiry date,
  insurance_expiry date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicles_user on public.vehicles (user_id);

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

alter table public.vehicles enable row level security;

create policy "vehicles_all_own" on public.vehicles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.vehicle_owned(p_vehicle uuid)
returns boolean
language sql
stable
as $$
  select p_vehicle is null or exists (select 1 from public.vehicles v where v.id = p_vehicle and v.user_id = auth.uid());
$$;

-- Belanja boleh dipautkan kepada kenderaan milik sendiri sahaja.
alter table public.expenses
  add constraint expenses_vehicle_fk foreign key (vehicle_id) references public.vehicles (id) on delete set null;
create index expenses_vehicle on public.expenses (vehicle_id);

drop policy "expenses_insert_own" on public.expenses;
drop policy "expenses_update_own" on public.expenses;
create policy "expenses_insert_own" on public.expenses
  for insert to authenticated with check (
    user_id = (select auth.uid()) and public.expense_refs_ok(category_id, receipt_id) and public.vehicle_owned(vehicle_id)
  );
create policy "expenses_update_own" on public.expenses
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid()) and public.expense_refs_ok(category_id, receipt_id) and public.vehicle_owned(vehicle_id)
  );

-- ---------------------------------------------------------------------------
create table public.vehicle_services (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  service_date date not null,
  odometer int check (odometer is null or odometer >= 0),
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  work_done text,
  workshop text,
  receipt_id uuid references public.receipts (id) on delete set null,
  next_service_km int check (next_service_km is null or next_service_km >= 0),
  next_service_date date,
  -- Belanja yang dicipta secara automatik untuk rekod ini.
  expense_id uuid references public.expenses (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicle_services_vehicle on public.vehicle_services (vehicle_id, service_date desc);

create table public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fill_date date not null,
  liters numeric(8, 3) check (liters is null or liters >= 0),
  amount numeric(12, 2) not null check (amount >= 0),
  odometer int check (odometer is null or odometer >= 0),
  station text,
  receipt_id uuid references public.receipts (id) on delete set null,
  expense_id uuid references public.expenses (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fuel_logs_vehicle on public.fuel_logs (vehicle_id, fill_date desc);

create trigger vehicle_services_set_updated_at
  before update on public.vehicle_services
  for each row execute function public.set_updated_at();
create trigger fuel_logs_set_updated_at
  before update on public.fuel_logs
  for each row execute function public.set_updated_at();

alter table public.vehicle_services enable row level security;
alter table public.fuel_logs enable row level security;

create policy "vehicle_services_select_own" on public.vehicle_services
  for select to authenticated using (user_id = (select auth.uid()));
create policy "vehicle_services_insert_own" on public.vehicle_services
  for insert to authenticated with check (
    user_id = (select auth.uid()) and vehicle_id is not null and public.vehicle_owned(vehicle_id)
    and public.expense_refs_ok(null, receipt_id)
  );
create policy "vehicle_services_update_own" on public.vehicle_services
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid()) and public.vehicle_owned(vehicle_id) and public.expense_refs_ok(null, receipt_id)
  );
create policy "vehicle_services_delete_own" on public.vehicle_services
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "fuel_logs_select_own" on public.fuel_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "fuel_logs_insert_own" on public.fuel_logs
  for insert to authenticated with check (
    user_id = (select auth.uid()) and vehicle_id is not null and public.vehicle_owned(vehicle_id)
    and public.expense_refs_ok(null, receipt_id)
  );
create policy "fuel_logs_update_own" on public.fuel_logs
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid()) and public.vehicle_owned(vehicle_id) and public.expense_refs_ok(null, receipt_id)
  );
create policy "fuel_logs_delete_own" on public.fuel_logs
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Penyelarasan belanja automatik
-- ---------------------------------------------------------------------------
create or replace function public.system_expense_category(p_name text)
returns uuid
language sql
stable
as $$
  select id from public.expense_categories where user_id is null and name = p_name limit 1;
$$;

create or replace function public.vehicle_services_sync_expense()
returns trigger
language plpgsql
as $$
declare
  v_name text;
  v_merchant text;
begin
  select name into v_name from public.vehicles where id = new.vehicle_id;
  v_merchant := coalesce(nullif(trim(new.workshop), ''), 'Servis ' || coalesce(v_name, 'kenderaan'));

  if new.expense_id is not null and exists (select 1 from public.expenses where id = new.expense_id) then
    update public.expenses set
      expense_date = new.service_date,
      amount = new.cost,
      merchant = v_merchant,
      note = nullif(trim(coalesce(new.work_done, '')), ''),
      receipt_id = new.receipt_id,
      vehicle_id = new.vehicle_id
    where id = new.expense_id;
  else
    insert into public.expenses (user_id, expense_date, amount, merchant, category_id, note, receipt_id, vehicle_id)
    values (
      new.user_id, new.service_date, new.cost, v_merchant, public.system_expense_category('Kenderaan'),
      nullif(trim(coalesce(new.work_done, '')), ''), new.receipt_id, new.vehicle_id
    )
    returning id into new.expense_id;
  end if;
  return new;
end;
$$;

create trigger vehicle_services_sync_expense
  before insert or update of service_date, cost, workshop, work_done, receipt_id, vehicle_id on public.vehicle_services
  for each row execute function public.vehicle_services_sync_expense();

create or replace function public.fuel_logs_sync_expense()
returns trigger
language plpgsql
as $$
declare
  v_name text;
  v_merchant text;
  v_note text;
begin
  select name into v_name from public.vehicles where id = new.vehicle_id;
  v_merchant := coalesce(nullif(trim(new.station), ''), 'Isi minyak');
  v_note := coalesce(v_name, 'Kenderaan') || case when new.liters is not null then ' · ' || trim(to_char(new.liters, 'FM999990.00')) || ' L' else '' end;

  if new.expense_id is not null and exists (select 1 from public.expenses where id = new.expense_id) then
    update public.expenses set
      expense_date = new.fill_date,
      amount = new.amount,
      merchant = v_merchant,
      note = v_note,
      receipt_id = new.receipt_id,
      vehicle_id = new.vehicle_id
    where id = new.expense_id;
  else
    insert into public.expenses (user_id, expense_date, amount, merchant, category_id, note, receipt_id, vehicle_id)
    values (new.user_id, new.fill_date, new.amount, v_merchant, public.system_expense_category('Minyak'), v_note, new.receipt_id, new.vehicle_id)
    returning id into new.expense_id;
  end if;
  return new;
end;
$$;

create trigger fuel_logs_sync_expense
  before insert or update of fill_date, amount, liters, station, receipt_id, vehicle_id on public.fuel_logs
  for each row execute function public.fuel_logs_sync_expense();

-- Padam rekod -> padam belanja berkaitan.
create or replace function public.vehicle_records_delete_expense()
returns trigger
language plpgsql
as $$
begin
  if old.expense_id is not null then
    delete from public.expenses where id = old.expense_id;
  end if;
  return old;
end;
$$;

create trigger vehicle_services_delete_expense
  after delete on public.vehicle_services
  for each row execute function public.vehicle_records_delete_expense();
create trigger fuel_logs_delete_expense
  after delete on public.fuel_logs
  for each row execute function public.vehicle_records_delete_expense();

-- Odometer kenderaan mengikut bacaan tertinggi yang direkod.
create or replace function public.vehicle_records_bump_odometer()
returns trigger
language plpgsql
as $$
begin
  if new.odometer is not null then
    update public.vehicles
    set current_odometer = greatest(coalesce(current_odometer, 0), new.odometer)
    where id = new.vehicle_id and coalesce(current_odometer, 0) < new.odometer;
  end if;
  return null;
end;
$$;

create trigger vehicle_services_bump_odometer
  after insert or update of odometer on public.vehicle_services
  for each row execute function public.vehicle_records_bump_odometer();
create trigger fuel_logs_bump_odometer
  after insert or update of odometer on public.fuel_logs
  for each row execute function public.vehicle_records_bump_odometer();
