-- Fasa 1: profil pengguna + fungsi umum

-- Fungsi umum: kemas kini updated_at setiap kali baris diubah.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- Fasa 7 (SaaS). Belum digunakan: semua pengguna 'free' tanpa had.
  plan text not null default 'free',
  plan_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());

-- Pengguna hanya boleh tukar nama paparan. Kolum plan dikunci (lihat trigger di bawah).
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Halang pengguna menaik taraf pakej sendiri melalui API. Hanya service role boleh ubah plan.
create or replace function public.profiles_lock_plan()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.plan = old.plan;
    new.plan_expires_at = old.plan_expires_at;
  end if;
  return new;
end;
$$;

create trigger profiles_lock_plan
  before update on public.profiles
  for each row execute function public.profiles_lock_plan();

-- Cipta profil secara automatik bila pengguna mendaftar.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
