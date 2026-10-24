-- Fasa 6: pautan dan folder

create table public.link_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index link_folders_unique_name on public.link_folders (user_id, lower(name));

create trigger link_folders_set_updated_at
  before update on public.link_folders
  for each row execute function public.set_updated_at();

alter table public.link_folders enable row level security;

create policy "link_folders_all_own" on public.link_folders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null check (url ~* '^https?://' and char_length(url) <= 2048),
  title text,
  description text,
  image_url text check (image_url is null or image_url ~* '^https?://'),
  folder_id uuid references public.link_folders (id) on delete set null,
  note text,
  is_favourite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index links_user_created on public.links (user_id, created_at desc);
create index links_folder on public.links (folder_id);

create trigger links_set_updated_at
  before update on public.links
  for each row execute function public.set_updated_at();

alter table public.links enable row level security;

create or replace function public.link_folder_owned(p_folder uuid)
returns boolean
language sql
stable
as $$
  select p_folder is null or exists (select 1 from public.link_folders f where f.id = p_folder and f.user_id = auth.uid());
$$;

create policy "links_select_own" on public.links
  for select to authenticated using (user_id = (select auth.uid()));
create policy "links_insert_own" on public.links
  for insert to authenticated with check (user_id = (select auth.uid()) and public.link_folder_owned(folder_id));
create policy "links_update_own" on public.links
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.link_folder_owned(folder_id));
create policy "links_delete_own" on public.links
  for delete to authenticated using (user_id = (select auth.uid()));
