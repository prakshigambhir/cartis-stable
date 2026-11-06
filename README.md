# Carrot

Horse care and stable management with Supabase account access and private database storage.

Sign-up uses email and password with email confirmation. Each user starts with an empty stable. Profiles, horses, care records, event plans and listings save automatically; check-in photos and videos use private media storage. Database policies restrict each workspace to its owner.

Configure Supabase custom SMTP and the Site URL / redirect allowlist for your production domain before enabling public registration. Never put secret, service-role or SMTP keys in this repository. cloud-config.js contains public client settings only.

The interface is a responsive installable web app. Camera capture records a photo and owner-entered observation; it does not diagnose health or automatically identify animals. Auctions are workspace listing records, with no bidding or payments.

Vercel publishes this static repository root. No build step is required.


## Phase 1: connected private and sales experiences

Open a horse profile and choose **Private | Sales & Auction**. Drafts remain linked to the existing Horse ID. Explicitly select the fields, records and media buyers may see, preview, then confirm publication. Editing a draft does not update the published presentation until republished. Unpublish removes future access to the buyer page and protected assets. Copies already downloaded cannot be recalled.

Backend migration: `database/migrations/20261106_connected_sales.sql` (additive; existing workspaces untouched). Deploy `supabase/functions/listing-media/index.ts` using the accompanying `supabase/config.toml`. The media gateway is intentionally callable anonymously and independently checks published state and approved asset on every request. Runtime service credentials stay on the server. Never expose private bucket paths or signed URLs. Do not enable buyer publishing until this gateway is configured and validated.

New public route: `#sale/<listing UUID>`; existing `#horse/<horse ID>`, `#listing/<listing UUID>` and `#marketplace` remain private. Sale drafts have no automatically selected private records. Legacy drafts are preserved and must be linked to an owned horse before publishing. No bidding, payments, AI diagnosis, veterinary verification, team collaboration or 3D/VR is introduced.

Tests: `node tests/connected-sales.mjs`, `node tests/media-gateway.mjs`; run `tests/publication-privacy.sql` in a database test session (transaction rolls all fixtures back). Privacy SQL has been run successfully against the existing project. Existing account sync and camera lifecycle tests passed in the retained structured source. Design QA used isolated fictional local records, not user credentials. See `PHASE1_PLAN.md` for the inspected architecture and implementation decisions.
