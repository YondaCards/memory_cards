# Flashcards

A personal, free Anki-style flashcard app: organize cards into decks, review
them with SM-2 spaced repetition, and optionally make a deck public so other
signed-in users can study it too (each user keeps their own progress).

## One-time setup

1. **Supabase project**
   - Create a free project at https://supabase.com/dashboard.
   - Open the SQL Editor and run the contents of `supabase/schema.sql`.
   - Under Authentication → Providers, enable Google and follow Supabase's
     instructions to create a Google Cloud OAuth client.
   - Under Authentication → URL Configuration, set **Site URL** to your
     deployed GitHub Pages URL (e.g. `https://<username>.github.io/<repo>/`).
     Supabase falls back to this URL after sign-in if the redirect URL
     doesn't exactly match an allow-listed entry, so leaving it at the
     default `http://localhost:3000` will strand users there after Google
     sign-in.
   - In that same section, add `http://localhost:5173/**` and
     `https://<username>.github.io/<repo>/**` (note the trailing `/**`
     wildcard) to the allowed redirect URLs. The app always redirects back
     with a trailing slash, so entries without the wildcard won't match.
   - Copy the project URL and anon key from Project Settings → API. The
     anon key is meant to be public — it's safe to commit and to bake into
     a public build. Row-Level Security policies in `supabase/schema.sql`
     are what actually protect the data, not the secrecy of this key.

2. **Local development**
   - Copy `.env.example` to `.env.local` and fill in the Supabase URL and
     anon key from step 1.
   - `npm install`
   - `npm run dev`

3. **GitHub Pages deployment**
   - In the repo's Settings → Pages, set Source to "GitHub Actions".
   - In Settings → Secrets and variables → Actions, add repository secrets
     `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values
     as your `.env.local`.
   - Push to `main` — the workflow in `.github/workflows/deploy.yml` builds
     and deploys automatically.

## Scripts

- `npm run dev` — local dev server
- `npm test` — run unit tests (SM-2 algorithm, import parser)
- `npm run build` — production build to `dist/`
