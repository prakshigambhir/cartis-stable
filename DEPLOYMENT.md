# Cartis launch

Status: deployment files and Supabase adapter prepared. No GitHub repository, live deployment or database migration has been confirmed yet.

## GitHub Pages

Put this folder's contents in the Cartis repository, with `dist/`, `database/` and `.github/` at its root. Do not upload browser backups, real horse records, local test files, credentials or `.openai/`.

In repository Settings → Pages, choose **GitHub Actions** as the source. The included Publish Cartis workflow deploys `dist/` on pushes to main. Its successful deployment result provides the phone-accessible HTTPS address. A private repository may require a paid GitHub plan for Pages. The Pages website is public even when the source repository is private on supported plans.

GitHub Pages serves the interface, not a database or the Python event proxy. On Pages, selected event catalogue entries and organiser links remain available, while the local-only live calendar/news proxy is unavailable. Deploy that API separately before advertising live event discovery.

## Supabase

1. Create a Supabase project in your own account and choose the region appropriate for your users. Keep the database password private.
2. Run `database/schema.sql` once using Supabase SQL Editor. It creates an owner-only workspace snapshot table, a revision-checked save function, and a private media bucket. Do not disable Row Level Security.
3. Under Authentication → Email Templates → Magic Link, use `{{ .Token }}` in the body so the app's email-code form can verify the code. Configure email sending and test delivery before inviting users.
4. Set `url` and `publishableKey` in `dist/cloud-config.js` to your project URL and public publishable key. A legacy public anon key also works. Never put database passwords, service_role keys or secret keys in this file or GitHub.
5. Publish the update. In Cartis, open **Cloud & devices**, sign in with the email code and select **Upload this workspace**. It uploads a snapshot of the local horses, tasks, logs, plans, sale listings and profile plus referenced check-in photos and uploaded videos. Example records are included if present; review them first.
6. On your phone, open the published link, select **Load my cloud workspace**, verify the same email and load your cloud copy. This replaces that browser's workspace after an explicit confirmation. Local edits require another upload. This is manual transfer, not live multi-device sync.

Snapshots use one private row per verified Supabase user and immutable private media objects. Another account cannot read them under the supplied policies. The save function rejects an outdated revision. Load the latest cloud copy before uploading from another device; export local changes first if necessary. A browser must load an existing cloud copy before it can replace it.

The prototype's local email-only entry flow remains a browser convenience and does not authorize cloud access. Downloaded snapshots are readable by anyone using the same browser profile. Do not use a shared device for private records. Multi-user stable permissions, automatic sync, conflict merging, full recovery/history, media garbage collection, and a production authentication-only entry flow are not implemented. Old snapshot media remains in private storage; establish retention/cleanup before larger use. Deleting a Supabase user does not automatically delete storage objects.

No genuine records are bundled with the source. Upload only the records you intend to keep in the chosen account. Local sample records have not been automatically uploaded.

## Phone installation

After opening the published HTTPS URL:

- iPhone Safari: Share → Add to Home Screen.
- Android Chrome: Menu → Install app / Add to Home screen.

The manifest supplies a standalone Cartis window and app icons. The service worker caches the public app shell for later offline access. API responses, user records and cloud sessions are not cached by the service worker. Records and media still use the browser's local databases until explicitly uploaded. Camera permission requires HTTPS and the user's consent. Offline first launch, native app stores, push notifications and automatic offline sync are not included.

## Validation before real use

Local syntax, snapshot validation, missing-media failure and revision-conflict behaviour are covered by tests. Before real records are uploaded, apply the SQL in a test Supabase project, then verify email delivery, account A/B data isolation, storage isolation, upload/restore of a photo and video, stale-revision rejection, failure recovery and iPhone/Android camera behaviour. Those live integration checks require a configured project and devices and have not yet run.

References: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Supabase email code sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Installable web apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
