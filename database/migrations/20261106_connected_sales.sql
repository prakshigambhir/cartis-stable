begin;
create table if not exists public.carrot_sale_publications (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 horse_id text not null,
 state text not null check(state in ('published','unpublished')),
 revision bigint not null default 1,
 document jsonb not null default '{}',
 assets jsonb not null default '{}',
 approved_refs jsonb not null default '{}',
 updated_at timestamptz not null default now()
);
alter table public.carrot_sale_publications enable row level security;
revoke all on public.carrot_sale_publications from anon,authenticated;
grant select on public.carrot_sale_publications to authenticated;
create policy "Owners inspect sale publications" on public.carrot_sale_publications for select to authenticated using(owner_id=(select auth.uid()));
create table if not exists public.carrot_publication_audit (
 id bigint generated always as identity primary key,
 listing_id uuid not null references public.carrot_sale_publications(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 action text not null check(action in ('publish','update','unpublish')),
 revision bigint not null,
 approved_refs jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.carrot_publication_audit enable row level security;
revoke all on public.carrot_publication_audit from anon,authenticated;
grant select on public.carrot_publication_audit to authenticated;
create policy "Owners inspect publication audit" on public.carrot_publication_audit for select to authenticated using(owner_id=(select auth.uid()));

-- Builds an allowlisted presentation from the authenticated owner's saved workspace.
-- No client-supplied document, storage path, owner ID or veterinarian assertion is accepted.
create or replace function public.publish_carrot_listing(listing_id uuid, expected_workspace_revision bigint, expected_publication_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 owner uuid:=auth.uid(); w jsonb; l jsonb; h jsonb; s jsonb; doc jsonb; assets jsonb:='{}';
 photos jsonb:='[]'; records jsonb:='[]'; selected jsonb; item jsonb; ref jsonb;
 k text; key text; source text; path text; next_rev bigint; previous public.carrot_sale_publications%rowtype;
begin
 if owner is null then raise exception 'Sign in first'; end if;
 select payload into w from public.cartis_workspaces where user_id=owner and revision=expected_workspace_revision for update;
 if w is null then raise exception 'Workspace changed. Reload before publishing.'; end if;
 select x into l from jsonb_array_elements(w->'records'->'listings') x where x->>'id'=listing_id::text;
 if l is null then raise exception 'Listing not found'; end if;
 select x into h from jsonb_array_elements(w->'records'->'horses') x where x->>'id'=l->>'sourceHorseId';
 if h is null then raise exception 'Link this draft to a horse in your stable first'; end if;
 if coalesce(l->>'city','')='' or coalesce(l->>'country','')='' then raise exception 'Add a seller location first'; end if;
 s:=coalesce(l->'sharing','{}');
 doc:=jsonb_build_object('id',listing_id,'horseId',h->>'id','name',h->>'name','breed',h->>'breed','age',h->>'age','sex',h->>'sex');
 foreach k in array array['description','country','city','bredIn','saleType','amount','currency','closeDate','disclosures'] loop
  doc:=doc||jsonb_build_object(k,l->>k);
 end loop;
 foreach k in array array['sire','dam','history','role','training','medical','withdrawal'] loop
  if coalesce(s->'fields','[]') ? k then doc:=doc||jsonb_build_object(k,h->>k); end if;
 end loop;
 -- Approved log/task IDs must belong to this same horse. No rider/contact fields are projected.
 for item in select value from jsonb_array_elements(coalesce(w->'records'->'logs','[]')) loop
  if item->>'horse'=h->>'id' and coalesce(s->'logs','[]') ? (item->>'id') then
   records:=records||jsonb_build_array(jsonb_build_object('id',item->>'id','kind','Observation','date',item->>'date','type',item->>'type','notes',item->>'notes','verification','Owner-entered; not veterinarian verified'));
  end if;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(w->'records'->'tasks','[]')) loop
  if item->>'horse'=h->>'id' and coalesce(s->'tasks','[]') ? (item->>'id') then
   records:=records||jsonb_build_array(jsonb_build_object('id',item->>'id','kind','Care record','date',item->>'date','type',item->>'type','title',item->>'title','done',item->'done','verification','Owner-entered; completion is not veterinary verification'));
  end if;
 end loop;
 -- Assemble the only selectable media sources; explicit media IDs are stable within the horse/listing.
 selected:='[]';
 if h->>'portrait' like 'data:image/%' then selected:=selected||jsonb_build_array(jsonb_build_object('id','portrait','kind','photo','url',h->>'portrait','label','Identification photo')); end if;
 for item in select value from jsonb_array_elements(coalesce(h->'media','[]')) loop
  selected:=selected||jsonb_build_array(item||jsonb_build_object('id','horse:'||(item->>'id'),'kind','photo'));
 end loop;
 for item in select value from jsonb_array_elements(coalesce(l->'media','[]')) loop
  if not coalesce((item->>'removed')::boolean,false) then selected:=selected||jsonb_build_array(item||jsonb_build_object('id','sale:'||(item->>'id'))); end if;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(w->'records'->'logs','[]')) loop
  if item->>'horse'=h->>'id' and item->>'photoId' is not null then selected:=selected||jsonb_build_array(jsonb_build_object('id','checkin:'||(item->>'id'),'kind','photo','photoId',item->>'photoId','label','Photo check-in · '||(item->>'date'))); end if;
 end loop;
 for item in select value from jsonb_array_elements(selected) loop
  key:=item->>'id';
  if not (coalesce(s->'media','[]') ? key) then continue; end if;
  ref:=null;
  if item->>'url' ~ '^data:image/(jpeg|png|webp);base64,' then
   ref:=jsonb_build_object('data',item->>'url','kind','photo');
  elsif item->>'blobId' is not null or item->>'photoId' is not null then
   k:=case when item->>'blobId' is not null then 'video' else 'photo' end;
   select value->>'path' into path from jsonb_array_elements(w->'media') where value->>'kind'=k and value->>'id'=coalesce(item->>'blobId',item->>'photoId');
   if path is null or split_part(path,'/',1)<>owner::text then raise exception 'Selected media has not finished saving'; end if;
   ref:=jsonb_build_object('path',path,'kind',k);
  elsif item->>'kind'='video' and item->>'url' ~ '^https://' and item->>'url' !~* '(supabase\.co|supabase\.in|/storage/v1/)' then
   photos:=photos||jsonb_build_array(jsonb_build_object('id',key,'kind','video','url',item->>'url','label',item->>'label'));
   continue;
  else raise exception 'A selected media item cannot be published. Choose an uploaded photo or supported video.';
  end if;
  assets:=assets||jsonb_build_object(key,ref);
  photos:=photos||jsonb_build_array(jsonb_build_object('id',key,'kind',ref->>'kind','label',coalesce(item->>'label','Horse media'),'protected',true));
 end loop;
 doc:=doc||jsonb_build_object('media',photos,'records',records,'verification','Seller-entered information. No veterinary certification or fitness-for-purchase assessment.','publishedAt',now());
 select * into previous from public.carrot_sale_publications where id=listing_id for update;
 if previous.id is not null and previous.owner_id<>owner then raise exception 'Permission denied'; end if;
 if coalesce(previous.revision,0)<>expected_publication_revision then raise exception 'Publication changed. Reload its status before publishing.'; end if;
 next_rev:=coalesce(previous.revision,0)+1;
 insert into public.carrot_sale_publications(id,owner_id,horse_id,state,revision,document,assets,approved_refs)
 values(listing_id,owner,h->>'id','published',next_rev,doc,assets,s)
 on conflict(id) do update set state='published',revision=next_rev,document=doc,assets=excluded.assets,approved_refs=s,horse_id=excluded.horse_id,updated_at=now();
 insert into public.carrot_publication_audit(listing_id,owner_id,action,revision,approved_refs)
 values(listing_id,owner,case when previous.id is null or previous.state='unpublished' then 'publish' else 'update' end,next_rev,s);
 return jsonb_build_object('state','published','revision',next_rev);
end $$;

create or replace function public.unpublish_carrot_listing(listing_id uuid,expected_publication_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.carrot_sale_publications%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into p from public.carrot_sale_publications where id=listing_id and owner_id=auth.uid() for update;
 if p.id is null then raise exception 'Listing unavailable'; end if;
 if p.revision<>expected_publication_revision then raise exception 'Publication changed. Reload its status.'; end if;
 update public.carrot_sale_publications set state='unpublished',document='{}',assets='{}',approved_refs='{}',revision=revision+1,updated_at=now() where id=listing_id;
 insert into public.carrot_publication_audit(listing_id,owner_id,action,revision,approved_refs) values(listing_id,auth.uid(),'unpublish',p.revision+1,'{}');
 return jsonb_build_object('state','unpublished','revision',p.revision+1);
end $$;
-- Public projections are available by shareable UUID only, never by scanning the private table.
create or replace function public.get_carrot_listing(listing_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select document from public.carrot_sale_publications where id=listing_id and state='published';
$$;
revoke all on function public.publish_carrot_listing(uuid,bigint,bigint) from public,anon;
revoke all on function public.unpublish_carrot_listing(uuid,bigint) from public,anon;
revoke all on function public.get_carrot_listing(uuid) from public;
grant execute on function public.publish_carrot_listing(uuid,bigint,bigint) to authenticated;
grant execute on function public.unpublish_carrot_listing(uuid,bigint) to authenticated;
grant execute on function public.get_carrot_listing(uuid) to anon,authenticated;
-- The gateway alone reads assets. Browser roles have no column access to other owners' rows.
grant select on public.carrot_sale_publications to service_role;
commit;
