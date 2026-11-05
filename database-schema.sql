-- Run once in your Supabase project's SQL editor.
-- Each verified account owns a private workspace snapshot; no public read policy.
create table if not exists public.cartis_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 1,
 payload jsonb not null,
 updated_at timestamptz not null default now(),
 constraint valid_payload check (jsonb_typeof(payload)='object' and payload->>'format'='cartis-cloud-v1')
);
alter table public.cartis_workspaces enable row level security;
revoke all on public.cartis_workspaces from anon, authenticated;
grant select on public.cartis_workspaces to authenticated;
create policy "Read own Cartis workspace" on public.cartis_workspaces
 for select to authenticated using ((select auth.uid())=user_id);
-- Writes use a revision check to avoid silently overwriting a newer device's upload.
create or replace function public.save_cartis_workspace(expected_revision bigint, workspace_payload jsonb)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid:=auth.uid(); new_revision bigint;
begin
 if owner_id is null then raise exception 'Sign in first'; end if;
 if workspace_payload->>'format' is distinct from 'cartis-cloud-v1' then raise exception 'Invalid workspace'; end if;
 if octet_length(workspace_payload::text)>20000000 then raise exception 'Workspace exceeds 20 MB'; end if;
 if expected_revision=0 then
  insert into public.cartis_workspaces(user_id,payload) values(owner_id,workspace_payload)
  on conflict do nothing returning revision into new_revision;
 else
  update public.cartis_workspaces set payload=workspace_payload,revision=revision+1,updated_at=now()
  where user_id=owner_id and revision=expected_revision returning revision into new_revision;
 end if;
 if new_revision is null then raise exception 'Cloud copy changed. Load the latest copy before uploading again.'; end if;
 return new_revision;
end $$;
revoke all on function public.save_cartis_workspace(bigint,jsonb) from public,anon;
grant execute on function public.save_cartis_workspace(bigint,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cartis-private','cartis-private',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict(id) do nothing;
create policy "Read own Cartis media" on storage.objects for select to authenticated
 using(bucket_id='cartis-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Upload own Cartis media" on storage.objects for insert to authenticated
 with check(bucket_id='cartis-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Delete own Cartis media" on storage.objects for delete to authenticated
 using(bucket_id='cartis-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
