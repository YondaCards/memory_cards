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
   - Under Authentication → URL Configuration, add your GitHub Pages URL
     (e.g. `https://<username>.github.io/<repo>/`) and
     `http://localhost:5173` to the allowed redirect URLs.
   - Copy the project URL and anon key from Project Settings → API.

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
