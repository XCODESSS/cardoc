begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

-- Fixed test identities are created with elevated test-runner privileges before
-- switching to the same authenticated/anon roles used by the API.
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'cardoc-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'cardoc-b@example.test');

select ok((select relrowsecurity from pg_class where oid = 'public.vehicles'::regclass), 'vehicles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.documents'::regclass), 'documents has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'storage.objects'::regclass), 'storage.objects has RLS enabled');
select is((select public from storage.buckets where id = 'cardoc-documents'), false, 'document bucket is private');
select is((select file_size_limit from storage.buckets where id = 'cardoc-documents'), 20971520::bigint, 'bucket limits uploads to 20 MiB');
select ok(not has_table_privilege('anon', 'public.vehicles', 'SELECT'), 'anon has no vehicle table grant');
select ok(not has_table_privilege('anon', 'public.documents', 'SELECT'), 'anon has no document table grant');

insert into public.vehicles (id, user_id, nickname, registration_number)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'A car', 'GJ05AB1234'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'B car', 'GJ05CD5678');

insert into public.documents
  (id, user_id, vehicle_id, scope, type, display_name, file_path, mime_type, size_bytes)
values
  ('aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vehicle', 'registration', 'A RC',
   '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa.pdf', 'application/pdf', 1024),
  ('bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'vehicle', 'registration', 'B RC',
   '22222222-2222-4222-8222-222222222222/bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb.pdf', 'application/pdf', 1024);

-- These direct storage.objects writes test SQL policies only. They do not test
-- Storage HTTP authorization or blob bytes; Task 5 live API tests must cover both.
insert into storage.objects (bucket_id, name, owner_id)
values
  ('cardoc-documents', '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa.pdf', '11111111-1111-4111-8111-111111111111'),
  ('cardoc-documents', '22222222-2222-4222-8222-222222222222/bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb.pdf', '22222222-2222-4222-8222-222222222222');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select is((select array_agg(id::text order by id) from public.vehicles),
  array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], 'A sees exactly A vehicle');
select is((select array_agg(id::text order by id) from public.documents),
  array['aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa'], 'A sees exactly A document');
select is((select array_agg(name order by name) from storage.objects where bucket_id = 'cardoc-documents'),
  array['11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa.pdf'],
  'A sees exactly A object');
select lives_ok($$insert into public.vehicles (user_id, nickname, registration_number)
  values ('11111111-1111-4111-8111-111111111111', 'A second car', 'GJ05EF1234')$$,
  'A can insert A vehicle');
select is((with changed as (
  update public.vehicles set nickname = 'A edited car'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning nickname
) select nickname from changed), 'A edited car', 'A updates A vehicle');
select is((with removed as (
  delete from public.vehicles where nickname = 'A second car' returning nickname
) select nickname from removed), 'A second car', 'A deletes A second vehicle');
select lives_ok($$insert into public.documents
  (id, user_id, scope, type, display_name, file_path, mime_type, size_bytes)
  values ('aaaaaaaa-0000-4000-8000-aaaaaaaaaaab',
  '11111111-1111-4111-8111-111111111111', 'driver', 'driving_license', 'A DL',
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-aaaaaaaaaaab.png', 'image/png', 1024)$$,
  'A can insert A driver document without vehicle');
select is((with changed as (
  update public.documents set display_name = 'A updated RC'
  where id = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa' returning display_name
) select display_name from changed), 'A updated RC', 'A updates A document');
select is((with removed as (
  delete from public.documents where id = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaab' returning id::text
) select id from removed), 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaab', 'A deletes A driver document');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('cardoc-documents', '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-aaaaaaaaaaab.png',
  '11111111-1111-4111-8111-111111111111')$$, 'A can upload into A folder');
select is((with removed as (
  delete from storage.objects where name =
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-aaaaaaaaaaab.png'
  returning name
) select name from removed),
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-aaaaaaaaaaab.png',
  'A deletes A object');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select is((select array_agg(id::text order by id) from public.vehicles),
  array['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'], 'B sees exactly B vehicle');
select is((select array_agg(id::text order by id) from public.documents),
  array['bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb'], 'B sees exactly B document');
select is((select array_agg(name order by name) from storage.objects where bucket_id = 'cardoc-documents'),
  array['22222222-2222-4222-8222-222222222222/bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb.pdf'],
  'B sees exactly B object');
select is((with changed as (
  update public.vehicles set nickname = 'B changed A car'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning id
) select count(*) from changed), 0::bigint, 'B cannot update A vehicle');
select is((with removed as (
  delete from public.vehicles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning id
) select count(*) from removed), 0::bigint, 'B cannot delete A vehicle');
select is((with changed as (
  update public.documents set display_name = 'B changed A RC'
  where id = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa' returning id
) select count(*) from changed), 0::bigint, 'B cannot update A document');
select is((with removed as (
  delete from public.documents where id = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa' returning id
) select count(*) from removed), 0::bigint, 'B cannot delete A document');
select is((with removed as (
  delete from storage.objects where name =
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa.pdf'
  returning id
) select count(*) from removed), 0::bigint, 'B cannot delete A object');
select throws_ok($$insert into public.vehicles (user_id, nickname, registration_number)
  values ('11111111-1111-4111-8111-111111111111', 'B forged A car', 'GJ05AB9876')$$,
  '42501', 'new row violates row-level security policy for table "vehicles"',
  'B cannot create A vehicle');
select throws_ok($$insert into public.documents
  (id, user_id, vehicle_id, scope, type, display_name, file_path, mime_type, size_bytes)
  values ('aaaaaaaa-0000-4000-8000-aaaaaaaaaaac',
  '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'vehicle', 'insurance', 'B forged A insurance',
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-aaaaaaaaaaac.pdf', 'application/pdf', 1024)$$,
  '42501', 'new row violates row-level security policy for table "documents"',
  'B cannot create A document');
select throws_ok($$insert into public.documents
  (id, user_id, vehicle_id, scope, type, display_name, file_path, mime_type, size_bytes)
  values ('bbbbbbbb-0000-4000-8000-bbbbbbbbbbbc',
  '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'vehicle', 'insurance', 'Wrong vehicle',
  '22222222-2222-4222-8222-222222222222/bbbbbbbb-0000-4000-8000-bbbbbbbbbbbc.pdf', 'application/pdf', 1024)$$,
  '23503', 'insert or update on table "documents" violates foreign key constraint "documents_vehicle_owner_fkey"',
  'B cannot attach a document to A vehicle');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('cardoc-documents', '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-bbbbbbbbbbbc.pdf',
  '22222222-2222-4222-8222-222222222222')$$,
  '42501', 'new row violates row-level security policy for table "objects"',
  'B cannot upload into A folder');
select is((with changed as (
  update storage.objects set name = '22222222-2222-4222-8222-222222222222/renamed.pdf'
  where name = '22222222-2222-4222-8222-222222222222/bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb.pdf'
  returning id
) select count(*) from changed), 0::bigint, 'client cannot update existing document object');

set local role anon;
set local request.jwt.claim.sub = '';

select throws_ok($$select count(*) from public.vehicles$$,
  '42501', 'permission denied for table vehicles', 'anon cannot read vehicles');
select throws_ok($$select count(*) from public.documents$$,
  '42501', 'permission denied for table documents', 'anon cannot read documents');
select is((select count(*) from storage.objects where bucket_id = 'cardoc-documents'), 0::bigint,
  'anon cannot enumerate document objects');
select * from finish();
rollback;
