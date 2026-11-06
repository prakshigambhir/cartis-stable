-- Transaction-only fixtures: all accounts and records roll back, no emails sent.
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-0000000000a1','phase1-a@example.invalid'),('00000000-0000-4000-8000-0000000000b1','phase1-b@example.invalid');
insert into public.cartis_workspaces(user_id,revision,payload) values('00000000-0000-4000-8000-0000000000a1',1,
'{"format":"cartis-cloud-v1","records":{"horses":[{"id":"h-a","name":"Test horse","breed":"Warmblood","age":8,"sex":"Mare","sire":"Approved sire","medical":"SECRET_MEDICAL","withdrawal":"SECRET_WITHDRAWAL","passport":"SECRET_PASSPORT","media":[{"id":"p1","url":"data:image/png;base64,aGVsbG8=","label":"Approved photo"},{"id":"p2","url":"data:image/png;base64,c2VjcmV0","label":"SECRET_PHOTO"}]}],"logs":[{"id":"log-a","horse":"h-a","date":"2026-11-06","type":"Training","notes":"Approved observation","rider":"SECRET_RIDER"},{"id":"log-b","horse":"other-horse","notes":"SECRET_OTHER_HORSE"}],"tasks":[],"events":[],"listings":[{"id":"00000000-0000-4000-8000-000000000001","sourceHorseId":"h-a","city":"Test city","country":"Test country","saleType":"Private sale","description":"Approved description","sharing":{"fields":["sire","passport"],"logs":["log-a","log-b"],"media":["horse:p1"]},"media":[]}]},"media":[]}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
do $$begin
 if public.get_carrot_listing('00000000-0000-4000-8000-000000000001') is not null then raise exception 'Draft leaked'; end if;
 perform public.publish_carrot_listing('00000000-0000-4000-8000-000000000001',1,0);
end$$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$declare d jsonb;begin
 d:=public.get_carrot_listing('00000000-0000-4000-8000-000000000001');
 if d->>'sire'<>'Approved sire' or jsonb_array_length(d->'records')<>1 then raise exception 'Approved fields missing or foreign log leaked'; end if;
 if d::text like '%SECRET_%' or d::text like '%data:image%' or d::text like '%storage/v1%' then raise exception 'Private data leaked'; end if;
 if jsonb_array_length(d->'media')<>1 or d->'media'->0->>'id'<>'horse:p1' then raise exception 'Media selection failed'; end if;
 begin perform * from public.cartis_workspaces; raise exception 'Anonymous workspace access'; exception when insufficient_privilege then null; end;
 begin perform * from public.carrot_sale_publications; raise exception 'Anonymous raw publication access'; exception when insufficient_privilege then null; end;
 begin perform public.publish_carrot_listing('00000000-0000-4000-8000-000000000001',1,1); raise exception 'Anonymous publish access'; exception when insufficient_privilege then null; end;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b1',true);
do $$begin
 if exists(select 1 from public.carrot_sale_publications) then raise exception 'Other owner sees raw assets'; end if;
 if exists(select 1 from public.carrot_publication_audit) then raise exception 'Other owner sees audit'; end if;
 begin perform public.unpublish_carrot_listing('00000000-0000-4000-8000-000000000001',1); raise exception 'Other owner revoked'; exception when others then if sqlerrm<>'Listing unavailable' then raise; end if; end;
 begin perform public.publish_carrot_listing('00000000-0000-4000-8000-000000000001',1,1); raise exception 'Other owner published'; exception when others then if sqlerrm<>'Workspace changed. Reload before publishing.' then raise; end if; end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
do $$begin
 begin perform public.publish_carrot_listing('00000000-0000-4000-8000-000000000001',2,1); raise exception 'Stale workspace allowed'; exception when others then if sqlerrm<>'Workspace changed. Reload before publishing.' then raise; end if; end;
 begin perform public.publish_carrot_listing('00000000-0000-4000-8000-000000000001',1,0); raise exception 'Stale publication allowed'; exception when others then if sqlerrm<>'Publication changed. Reload its status before publishing.' then raise; end if; end;
 perform public.unpublish_carrot_listing('00000000-0000-4000-8000-000000000001',1);
 if exists(select 1 from public.carrot_sale_publications where assets<>'{}'::jsonb or document<>'{}'::jsonb) then raise exception 'Revoked data retained in public projection'; end if;
 if (select count(*) from public.carrot_publication_audit)<>2 then raise exception 'Audit missing'; end if;
end$$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 if public.get_carrot_listing('00000000-0000-4000-8000-000000000001') is not null then raise exception 'Unpublished page still visible'; end if;
end$$;
reset role;
select 'PASS: draft privacy, allowlisted records, media selection, anonymous restrictions, owner isolation, stale revisions, audit and unpublish revocation' as result;
rollback;
