# Carrot

Horse care and stable management with Supabase account access and private database storage.

Sign-up uses email and password with email confirmation. Each user starts with an empty stable. Profiles, horses, care records, event plans and listings save automatically; check-in photos and videos use private media storage. Database policies restrict each workspace to its owner.

Configure Supabase custom SMTP and the Site URL / redirect allowlist for your production domain before enabling public registration. Never put secret, service-role or SMTP keys in this repository. cloud-config.js contains public client settings only.

The interface is a responsive installable web app. Camera capture records a photo and owner-entered observation; it does not diagnose health or automatically identify animals. Auctions are workspace listing records, with no bidding or payments.

Vercel publishes this static repository root. No build step is required.
