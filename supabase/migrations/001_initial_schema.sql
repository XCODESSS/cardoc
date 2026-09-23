-- Cardoc metadata is readable and writable only by its owner. Files live in a
-- private bucket under <user_id>/<document_id>.<extension>.
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null,
  registration_number text not null,
  manufacturer text,
  model text,
  year integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_id_user_id_key unique (id, user_id),
  constraint vehicles_required_fields_check check (
    length(trim(nickname)) >= 1 and length(trim(registration_number)) >= 4
  )
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid,
  scope text not null,
  type text not null,
  display_name text not null,
  file_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_vehicle_owner_fkey foreign key (vehicle_id, user_id)
    references public.vehicles (id, user_id),
  constraint documents_scope_check check (scope in ('vehicle', 'driver')),
  constraint documents_type_check check (type in (
    'registration', 'driving_license', 'insurance', 'puc', 'warranty',
    'service', 'invoice', 'finance', 'other'
  )),
  constraint documents_scope_type_vehicle_check check (
    (scope = 'driver' and type = 'driving_license' and vehicle_id is null)
    or (scope = 'vehicle' and type <> 'driving_license' and vehicle_id is not null)
  ),
  constraint documents_display_name_check check (length(trim(display_name)) >= 1),
  constraint documents_file_path_check check (
    file_path like user_id::text || '/' || id::text || '.%'
  ),
  constraint documents_mime_type_check check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint documents_size_check check (size_bytes > 0 and size_bytes <= 20971520)
);

create index vehicles_user_id_idx on public.vehicles (user_id);
create index documents_user_id_vehicle_id_idx on public.documents (user_id, vehicle_id);

create function public.set_cardoc_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger vehicles_updated_at before update on public.vehicles
for each row execute function public.set_cardoc_updated_at();
create trigger documents_updated_at before update on public.documents
for each row execute function public.set_cardoc_updated_at();

alter table public.vehicles enable row level security;
alter table public.documents enable row level security;

revoke all on public.vehicles, public.documents from anon, authenticated;
grant select, insert, delete on public.vehicles, public.documents to authenticated;
grant update (nickname, registration_number, manufacturer, model, year)
  on public.vehicles to authenticated;
grant update (vehicle_id, scope, type, display_name, expiry_date)
  on public.documents to authenticated;

create policy vehicles_select_own on public.vehicles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy vehicles_insert_own on public.vehicles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy vehicles_update_own on public.vehicles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy vehicles_delete_own on public.vehicles
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy documents_select_own on public.documents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy documents_insert_own on public.documents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy documents_update_own on public.documents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy documents_delete_own on public.documents
  for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cardoc-documents', 'cardoc-documents', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive policies keep this bucket private even if the project has a
-- broad permissive Storage policy for some other bucket.
create policy cardoc_storage_select_boundary on storage.objects as restrictive
  for select to public using (
    bucket_id <> 'cardoc-documents'
    or (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy cardoc_storage_insert_boundary on storage.objects as restrictive
  for insert to public with check (
    bucket_id <> 'cardoc-documents'
    or (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy cardoc_storage_delete_boundary on storage.objects as restrictive
  for delete to public using (
    bucket_id <> 'cardoc-documents'
    or (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy cardoc_storage_no_update on storage.objects as restrictive
  for update to public
  using (bucket_id <> 'cardoc-documents')
  with check (bucket_id <> 'cardoc-documents');

create policy cardoc_storage_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'cardoc-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy cardoc_storage_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'cardoc-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy cardoc_storage_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'cardoc-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
