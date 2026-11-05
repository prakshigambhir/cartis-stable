# Cartis

Horse care and stable web app.

This repository publishes the static web app directly from its root using GitHub Pages. In Settings → Pages choose **Deploy from a branch**, **main**, **/(root)**. No build is required.

For database setup, run `database-schema.sql` in your Supabase SQL Editor, then set only the public project URL and publishable key in `cloud-config.js`. See DEPLOYMENT.md for the email code template, data privacy and transfer limitations.

No personal horse records or credentials are included. The cloud adapter is unconfigured until a Supabase project is connected. Transfers are manual snapshots, not automatic sync.

The local demo sign-in is not secure authentication. Cloud access requires email verification. Camera capture records photos and owner-entered observations, without automatic identity or health analysis.

Phone: open the Pages HTTPS URL and use Add to Home Screen (Safari) or Install app (Chrome).

GitHub Pages cannot run the local Python news/calendar proxy. Selected catalogue entries and official organiser links remain available; live discovery needs a separately hosted API.

Horse photos: Unsplash. Supabase SDK 2.119.0: MIT, see SUPABASE-LICENSE.
