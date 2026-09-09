# Flashcard App (Anki-style) — Design

## Summary

A personal, free flashcard app for spaced-repetition learning, modeled on Anki. Users organize cards into folders ("decks") by topic and review them using the SM-2 spaced-repetition algorithm. The app supports multiple users with private decks by default and the option to make a deck public so other users can study it (each user keeps their own independent review progress on shared decks). The app is a static single-page app hosted for free on GitHub Pages, backed by a free-tier Supabase project for auth and data.

## Goals

- Personal-use flashcard app with Anki-like SM-2 spaced repetition, free to run indefinitely.
- Organize cards into folders (decks), one folder per subject/direction.
- Multiple users, each with their own private decks.
- A user can mark a deck public so other users can discover and study it with their own progress tracking.
- Add cards one at a time via a form, or in bulk via CSV/JSON file upload.
- Runs entirely as a static site on GitHub Pages — no custom backend server to operate.

## Non-goals

- Rich card content (images, audio, cloze deletion). Cards are plain text question/answer only for v1.
- Editing or syncing someone else's public deck — public decks are read-only to non-owners; if a user wants to modify one, that would require a future "copy to my decks" feature, not included in v1.
- Offline support / PWA behavior.
- Deploying a custom backend server — all backend needs are served by Supabase's hosted platform.

## Architecture

```
Browser (React SPA on GitHub Pages)
   |
   |  Supabase JS SDK (HTTPS)
   v
Supabase (hosted, free tier)
   - Auth (Google OAuth)
   - Postgres database (decks, cards, card_progress)
   - Row-Level Security policies enforce all access control
```

The frontend is a React + Vite single-page app. There is no custom server: the browser talks directly to Supabase using the public `anon` key. Supabase's Row-Level Security (RLS) policies are the actual access-control boundary — the anon key is safe to ship in the built JS bundle because it grants no access beyond what RLS allows.

A GitHub Actions workflow builds the Vite app and publishes the static output to GitHub Pages on every push to `main`.

## Data model (Supabase / Postgres)

### `decks`
| column | type | notes |
|---|---|---|
| id | uuid, pk | default `gen_random_uuid()` |
| owner_id | uuid | references `auth.users.id` |
| name | text | deck/folder name |
| is_public | boolean | default `false` |
| created_at | timestamptz | default `now()` |

### `cards`
| column | type | notes |
|---|---|---|
| id | uuid, pk | default `gen_random_uuid()` |
| deck_id | uuid | references `decks.id`, on delete cascade |
| front | text | question |
| back | text | answer |
| created_at | timestamptz | default `now()` |

### `card_progress`
| column | type | notes |
|---|---|---|
| id | uuid, pk | default `gen_random_uuid()` |
| user_id | uuid | references `auth.users.id` |
| card_id | uuid | references `cards.id`, on delete cascade |
| ease_factor | numeric | SM-2 EF, default `2.5` |
| interval_days | integer | default `0` |
| repetitions | integer | default `0` |
| due_date | date | when the card is next due |
| last_reviewed_at | timestamptz | nullable |

Unique constraint on `(user_id, card_id)` — one progress row per user per card. This is what makes a shared public deck work: every user studying it gets their own independent SM-2 state, without touching the deck or its cards.

### Row-Level Security

- `decks`: `select` where `owner_id = auth.uid() OR is_public = true`; `insert`/`update`/`delete` only where `owner_id = auth.uid()`.
- `cards`: `select` where the parent deck is owned by the caller or is public; `insert`/`update`/`delete` only where the parent deck is owned by the caller.
- `card_progress`: all operations restricted to `user_id = auth.uid()`.

## Authentication

Google OAuth via Supabase Auth (`supabase.auth.signInWithOAuth({ provider: 'google' })`). No passwords to manage. A `profiles` row is not strictly required for v1 since `auth.users` already carries the Google display name/avatar via user metadata; the app reads those directly from the session.

## SM-2 spaced repetition

Standard SM-2 as used by Anki:

- Each review presents Again / Hard / Good / Easy.
- On each answer, the app recomputes `ease_factor`, `interval_days`, and `repetitions` for that `(user, card)` pair using the standard SM-2 formula, then immediately `upsert`s the new row into `card_progress`.
- No batching or debouncing of writes — Supabase is a real database and per-answer writes are cheap and safe (unlike the git-commit-per-answer approach considered and rejected during design). Writing immediately also means progress is never lost if the tab closes mid-session.
- A card with no `card_progress` row yet is treated as new (due immediately, default EF 2.5).
- The study queue for a deck is: all cards in the deck (or in all of the user's decks, for a global "study" mode) whose `due_date <= today` or which have no progress row yet.

## Adding cards

- **Single card**: a form (front/back) on the deck page, inserted directly via the Supabase client.
- **Bulk import**: a file picker on the deck page accepting CSV or JSON (`[{"front": "...", "back": "..."}, ...]` or two-column CSV). Parsed client-side, inserted as one batch `insert` call into `cards`.

## Frontend structure

- React + Vite, React Router for navigation.
- Pages:
  - **Login** — Google sign-in button.
  - **Decks** — list of the user's own decks plus a browsable list of public decks from other users; create/rename/delete/toggle-public for own decks.
  - **Deck detail** — card list, add-card form, bulk import, delete cards (owner only).
  - **Study** — SM-2 review session for a deck (or all due cards across decks), showing front, revealing back, then Again/Hard/Good/Easy buttons.
- Auth state via a React context wrapping the Supabase session; protected routes redirect to Login when signed out.
- Data fetching via the Supabase JS client directly in components/hooks (no separate state-management library needed at this scale).

## Deployment

- GitHub Actions workflow (`.github/workflows/deploy.yml`) builds the Vite app on push to `main` and publishes `dist/` to GitHub Pages.
- One-time manual setup (by the user, outside this codebase): create a free Supabase project, enable Google OAuth provider, and configure the Supabase project URL + anon key as build-time env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), plus add the deployed GitHub Pages URL to Supabase's allowed redirect URLs for OAuth.

## Testing

Personal-scale project — no heavy test infrastructure. The one piece of logic worth unit-testing is the pure SM-2 calculation function (inputs: previous EF/interval/repetitions + grade; output: new EF/interval/repetitions/due_date), since it's easy to get subtly wrong and easy to test in isolation. Everything else is verified manually in the browser during development.
