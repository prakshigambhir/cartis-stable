# Phase 1: connected horse experiences

## Verified architecture
Buildless HTML/CSS/global JavaScript. `app.js` renders hash routes, `account.js` gates account routes, `cloud.js` persists a revision-checked workspace JSON to Supabase. Supabase Auth identifies the owner. `cartis_workspaces` has owner-only RLS; `cartis-private` stores owner-prefixed check-in photos and videos. Horse portraits/gallery photos are embedded in workspace JSON. `sales.js` has workspace-only listings, filters, media and exports; no public sales or bidding backend exists. `vision.js` captures still photos and manual observations only. Profile roles are descriptive: team collaboration and veterinarian authorization do not exist. No assessment, verified pedigree, veterinary verification, 3D, bidding or payment service exists.

## Reuse and exact modifications
- `dist/app.js` is reused unchanged: its `#horse/:id`, `#listing/:id` and `#marketplace` renderers are extended by `connected-sales.js`; private care/history/feed/media remain intact.
- `dist/sales.js`: retain catalogue/media helpers; route linked listing creation into the horse's Sales experience; deprecate copying horse identity for new drafts.
- `dist/connected-sales.js` (new): linked draft, explicit approvals, preview, publish/update/unpublish and owner audit UI; public `#sale/:id` with no sign-in requirement.
- `dist/connected-sales.css` (new): compact brown segmented navigation, sharing checklist, buyer presentation, responsive states.
- `dist/account.js`: allow only public sale route past account gate, retaining owner route restrictions.
- `dist/cloud.js`: backward-compatible stable media IDs, reset public caches on account switch.
- `dist/index.html`, `dist/sw.js`: load module/style and update shell version. API/media responses stay outside shell cache.
- `database/migrations/20261106_connected_sales.sql`: additive publication/audit tables and narrowly scoped RPCs. Private horse data remains the single source; publication is an explicitly selected, frozen presentation, not a cloned horse profile.
- `supabase/functions/listing-media/index.ts`: public no-cache gateway; validates current listing status and approved asset on each request, streams private media without exposing storage paths or signed URLs.
- Tests: SQL owner/other-user/anonymous isolation, draft secrecy, stale revisions, selected data only and revoke semantics; frontend consent/legacy linkage and gateway tests.

## Data changes and workflow
Drafts stay in existing `records.listings`, gain `sourceHorseId` and `sharing` (default no approvals). Existing listings are retained as private legacy drafts until linked to an owned horse. Existing horse/media/log IDs remain valid; missing gallery IDs are assigned once before saving. No existing records are deleted.

New `carrot_sale_publications` stores an owner/horse/listing link, publication revision, current approved projection and protected asset references. RLS allows owners to inspect their own publication only; anonymous visitors use a sanitized RPC. New immutable `carrot_publication_audit` records publish/update/unpublish with selected reference identifiers. RPCs check authenticated ownership, workspace revision, expected publication revision and source IDs. Unpublishing atomically clears public projection/assets. Public media gateway checks database status for every request; no public bucket or long-lived signed URL.

## UI
Horse profile: Private | Sales & Auction; Private remains default. Sales: linked identity, sale terms, unchecked sharing controls, draft save, buyer preview and explicit publish confirmation. Publication status is separate from selected experience. Existing sale uploads remain private until approved. Linked seller photo/video tools remain available on the existing listing page. Buyer URL contains only selected presentation and material, with unavailable/revoked states.

## Order and dependencies
1. Add migration and gateway; verify access boundaries.
2. Extend current profile and sales UI, public route, error/loading states.
3. Apply additive backend changes, validate rollback-only fixtures, then publish static changes to existing GitHub/Vercel deployment.
4. Verify responsive owner/public views without accessing user passwords or altering real horse data.

## Limits and later phases
No AI, gait scores, vet verification, team permissions, 3D/VR, new bidding/payment flows or buyer inquiry service in Phase 1. These need separate models, roles and integrations. Photos/videos can be selected now; original private media remains private. Once someone downloads published material it cannot be recalled; unpublish prevents future requests. Embedded photos retain the existing workspace 20 MB limit and uploaded videos 50 MB limit; resumable larger uploads belong to Phase 2. Public listing URLs are shareable, not a globally indexed marketplace/search service. Existing exported legacy listings are not a substitute for server publication.
