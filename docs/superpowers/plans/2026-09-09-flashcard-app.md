# Flashcard App (Anki-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal, free, multi-user Anki-style flashcard web app (folders of cards, SM-2 spaced repetition, private + public decks) that runs as a static React SPA on GitHub Pages backed by Supabase.

**Architecture:** React + Vite single-page app with no custom server. The browser talks directly to Supabase (Postgres + Auth) using the public anon key; Row-Level Security policies in Postgres are the real access-control boundary. `HashRouter` is used for client-side routing so the static site needs no server-side rewrite rules on GitHub Pages.

**Tech Stack:** React, Vite, react-router-dom (HashRouter), @supabase/supabase-js, Vitest (unit tests for pure logic only), GitHub Actions (build + deploy to GitHub Pages).

**Spec:** [docs/superpowers/specs/2026-09-09-flashcard-app-design.md](../specs/2026-09-09-flashcard-app-design.md)

## Global Constraints

- Plain JavaScript (JSX), no TypeScript — matches the "simple personal app" scope from the spec.
- No custom backend server — all data access goes through the Supabase JS client from the browser; access control is enforced entirely by Postgres Row-Level Security policies, never by client-side checks alone.
- Cards are plain text (front/back) only — no images/audio (spec Non-goals).
- Routing uses `HashRouter`, not `BrowserRouter` — GitHub Pages serves static files with no server-side rewrite, so any router that relies on real URL paths would 404 on refresh/deep-link.
- Supabase Auth must be configured with `flowType: 'pkce'` — the default implicit OAuth flow returns the session in a `#access_token=...` URL fragment, which collides with `HashRouter`'s own use of the URL hash for routes. PKCE returns a `?code=...` query param instead, which is safe to combine with `HashRouter`.
- Progress writes (`card_progress`) happen immediately on every answer — no batching/debouncing (see spec's SM-2 section for why this differs from the git-based idea that was rejected during design).
- Free tier only: GitHub Pages + Supabase free (Spark-equivalent) tier. No paid services.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/App.css`, `.gitignore` (via Vite scaffold)

**Interfaces:**
- Produces: a runnable Vite + React dev server; `src/App.jsx` default-exports the root `App` component that later tasks will modify.

- [ ] **Step 1: Scaffold the Vite React app**

Run from the repo root (`memory cards/`):

```bash
npm create vite@latest . -- --template react
```

If prompted about the current directory not being empty, choose to continue (the `docs/` folder and `.git` are fine to keep).

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install react-router-dom @supabase/supabase-js
npm install -D vitest
```

- [ ] **Step 3: Configure Vite for GitHub Pages + Vitest**

Edit `vite.config.js` to use a relative base (required so built asset URLs work when the site is served from a GitHub Pages subpath like `/repo-name/`) and add a Vitest config block:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 4: Add a test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 5: Verify the dev server runs**

```bash
npm run dev
```

Expected: Vite prints a local URL (e.g. `http://localhost:5173/`). Open it in a browser and confirm the default Vite+React starter page renders with no console errors. Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Scaffold Vite + React project

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Supabase schema and client

**Files:**
- Create: `supabase/schema.sql`
- Create: `src/supabaseClient.js`
- Create: `.env.example`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `src/supabaseClient.js` exports a singleton `supabase` client (`import { supabase } from '../supabaseClient'`), configured with `flowType: 'pkce'`. Later tasks (Auth, Decks, DeckDetail, Study) all import this.

- [ ] **Step 1: Write the schema + RLS SQL**

Create `supabase/schema.sql`:

```sql
-- Decks (folders)
create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- Cards
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks(id) on delete cascade,
  front text not null,
  back text not null,
  created_at timestamptz not null default now()
);

-- Per-user SM-2 review state, one row per (user, card)
create table if not exists card_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  ease_factor numeric not null default 2.5,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  due_date date not null default current_date,
  last_reviewed_at timestamptz,
  unique (user_id, card_id)
);

alter table decks enable row level security;
alter table cards enable row level security;
alter table card_progress enable row level security;

-- decks: owner has full access; anyone signed in can read public decks
create policy "decks_select" on decks
  for select using (owner_id = auth.uid() or is_public = true);

create policy "decks_insert" on decks
  for insert with check (owner_id = auth.uid());

create policy "decks_update" on decks
  for update using (owner_id = auth.uid());

create policy "decks_delete" on decks
  for delete using (owner_id = auth.uid());

-- cards: readable if the parent deck is owned by the caller or public;
-- writable only if the parent deck is owned by the caller
create policy "cards_select" on cards
  for select using (
    exists (
      select 1 from decks d
      where d.id = cards.deck_id
        and (d.owner_id = auth.uid() or d.is_public = true)
    )
  );

create policy "cards_insert" on cards
  for insert with check (
    exists (select 1 from decks d where d.id = cards.deck_id and d.owner_id = auth.uid())
  );

create policy "cards_update" on cards
  for update using (
    exists (select 1 from decks d where d.id = cards.deck_id and d.owner_id = auth.uid())
  );

create policy "cards_delete" on cards
  for delete using (
    exists (select 1 from decks d where d.id = cards.deck_id and d.owner_id = auth.uid())
  );

-- card_progress: strictly per-user, regardless of who owns the deck
create policy "progress_select" on card_progress
  for select using (user_id = auth.uid());

create policy "progress_insert" on card_progress
  for insert with check (user_id = auth.uid());

create policy "progress_update" on card_progress
  for update using (user_id = auth.uid());

create policy "progress_delete" on card_progress
  for delete using (user_id = auth.uid());
```

- [ ] **Step 2: Create the Supabase client module**

Create `src/supabaseClient.js`:

```js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE (not the default implicit flow) returns the session via a
    // `?code=` query param instead of a `#access_token=` URL fragment,
    // so it doesn't collide with HashRouter's use of the URL hash.
    flowType: 'pkce',
  },
})
```

- [ ] **Step 3: Document required env vars**

Create `.env.example`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4: Create your Supabase project (manual, one-time)**

In the [Supabase dashboard](https://supabase.com/dashboard): create a free project, then open the SQL Editor and paste/run the full contents of `supabase/schema.sql`. Copy the project's URL and anon key (Project Settings → API) into a local `.env.local` file (same keys as `.env.example` — `.env.local` is already git-ignored by the Vite scaffold).

- [ ] **Step 5: Verify the client module loads**

```bash
npm run dev
```

Expected: the app still loads with no console errors about `supabaseClient.js` (it isn't used by any component yet, so this just confirms the module itself has no syntax/import errors — check the terminal output for Vite build errors). Stop the server once confirmed.

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql src/supabaseClient.js .env.example
git commit -m "$(cat <<'EOF'
Add Supabase schema, RLS policies, and client module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: SM-2 spaced-repetition algorithm

**Files:**
- Create: `src/lib/sm2.js`
- Test: `src/lib/sm2.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `sm2(previous, grade, today = new Date())` and `DEFAULT_PROGRESS`, both exported from `src/lib/sm2.js`.
  - `previous`: `{ easeFactor: number, intervalDays: number, repetitions: number }`
  - `grade`: one of `'again' | 'hard' | 'good' | 'easy'`
  - Returns: `{ easeFactor: number, intervalDays: number, repetitions: number, dueDate: string }` where `dueDate` is an ISO `YYYY-MM-DD` string.
  - `DEFAULT_PROGRESS`: `{ easeFactor: 2.5, intervalDays: 0, repetitions: 0 }` — the state to use for a card with no prior review.
  - Later tasks (Study page) call this directly.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sm2.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { sm2, DEFAULT_PROGRESS } from './sm2'

describe('sm2', () => {
  it('schedules a new card answered "good" for 1 day out, repetitions 1', () => {
    const result = sm2(DEFAULT_PROGRESS, 'good', new Date('2026-01-01T00:00:00.000Z'))
    expect(result.intervalDays).toBe(1)
    expect(result.repetitions).toBe(1)
    expect(result.easeFactor).toBe(2.5)
    expect(result.dueDate).toBe('2026-01-02')
  })

  it('schedules the second consecutive "good" review 6 days out', () => {
    const first = sm2(DEFAULT_PROGRESS, 'good', new Date('2026-01-01T00:00:00.000Z'))
    const second = sm2(first, 'good', new Date('2026-01-02T00:00:00.000Z'))
    expect(second.intervalDays).toBe(6)
    expect(second.repetitions).toBe(2)
  })

  it('schedules the third consecutive "good" review using interval * ease factor', () => {
    const first = sm2(DEFAULT_PROGRESS, 'good', new Date('2026-01-01T00:00:00.000Z'))
    const second = sm2(first, 'good', new Date('2026-01-02T00:00:00.000Z'))
    const third = sm2(second, 'good', new Date('2026-01-08T00:00:00.000Z'))
    expect(third.intervalDays).toBe(15)
    expect(third.repetitions).toBe(3)
  })

  it('resets repetitions and interval to 1 day on "again"', () => {
    const first = sm2(DEFAULT_PROGRESS, 'good', new Date('2026-01-01T00:00:00.000Z'))
    const second = sm2(first, 'good', new Date('2026-01-02T00:00:00.000Z'))
    const failed = sm2(second, 'again', new Date('2026-01-08T00:00:00.000Z'))
    expect(failed.repetitions).toBe(0)
    expect(failed.intervalDays).toBe(1)
  })

  it('never lets ease factor drop below 1.3', () => {
    let state = DEFAULT_PROGRESS
    for (let i = 0; i < 10; i++) {
      state = sm2(state, 'again', new Date('2026-01-01T00:00:00.000Z'))
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3)
  })

  it('throws on an unknown grade', () => {
    expect(() => sm2(DEFAULT_PROGRESS, 'terrible')).toThrow('Unknown grade')
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
npx vitest run src/lib/sm2.test.js
```

Expected: FAIL — `src/lib/sm2.js` does not exist yet (module not found).

- [ ] **Step 3: Implement sm2.js**

Create `src/lib/sm2.js`:

```js
const GRADE_QUALITY = { again: 2, hard: 3, good: 4, easy: 5 }
const MIN_EASE_FACTOR = 1.3

export const DEFAULT_PROGRESS = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 }

export function sm2(previous, grade, today = new Date()) {
  const quality = GRADE_QUALITY[grade]
  if (quality === undefined) {
    throw new Error(`Unknown grade: ${grade}`)
  }

  let easeFactor = previous.easeFactor
  let repetitions = previous.repetitions
  let intervalDays

  if (quality < 3) {
    repetitions = 0
    intervalDays = 1
  } else {
    if (repetitions === 0) {
      intervalDays = 1
    } else if (repetitions === 1) {
      intervalDays = 6
    } else {
      intervalDays = Math.round(previous.intervalDays * easeFactor)
    }
    repetitions += 1
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (easeFactor < MIN_EASE_FACTOR) {
    easeFactor = MIN_EASE_FACTOR
  }

  return {
    easeFactor: Math.round(easeFactor * 100) / 100,
    intervalDays,
    repetitions,
    dueDate: addUtcDays(today, intervalDays),
  }
}

// Adds calendar days in UTC, independent of the machine's local timezone,
// so the same (previous, grade, today) always produces the same dueDate.
function addUtcDays(date, days) {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const result = new Date(utcMidnight)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
npx vitest run src/lib/sm2.test.js
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sm2.js src/lib/sm2.test.js
git commit -m "$(cat <<'EOF'
Add SM-2 spaced-repetition scheduling algorithm

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Authentication, routing skeleton, and navigation

**Files:**
- Create: `src/context/AuthContext.jsx`
- Create: `src/components/ProtectedRoute.jsx`
- Create: `src/components/NavBar.jsx`
- Create: `src/routes/Login.jsx`
- Create: `src/routes/Decks.jsx` (placeholder, replaced in Task 5)
- Create: `src/routes/DeckDetail.jsx` (placeholder, replaced in Task 6)
- Create: `src/routes/Study.jsx` (placeholder, replaced in Task 8)
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `supabase` from `src/supabaseClient.js` (Task 2).
- Produces:
  - `useAuth()` hook (from `src/context/AuthContext.jsx`) returning `{ user, session, loading, signInWithGoogle, signOut }`. `user` is `null` when signed out, otherwise the Supabase auth user object (`user.id`, `user.email`, `user.user_metadata.name`/`avatar_url`).
  - `<ProtectedRoute />` — a layout route element that renders `<Outlet />` when signed in, else redirects to `/login`.
  - Routes mounted in `App.jsx`: `/login`, `/decks`, `/decks/:deckId`, `/study`, `/study/:deckId`, with a catch-all redirecting to `/decks`.

- [ ] **Step 1: Create the auth context**

Create `src/context/AuthContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    })

  const signOut = () => supabase.auth.signOut()

  const value = {
    user: session?.user ?? null,
    session,
    loading,
    signInWithGoogle,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
```

- [ ] **Step 2: Create the protected route guard**

Create `src/components/ProtectedRoute.jsx`:

```jsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return <p>Loading…</p>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
```

- [ ] **Step 3: Create the login page**

Create `src/routes/Login.jsx`:

```jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { user, loading, signInWithGoogle } = useAuth()

  if (loading) {
    return <p>Loading…</p>
  }
  if (user) {
    return <Navigate to="/decks" replace />
  }

  return (
    <div className="login-page">
      <h1>Flashcards</h1>
      <button onClick={() => signInWithGoogle()}>Sign in with Google</button>
    </div>
  )
}
```

- [ ] **Step 4: Create the nav bar**

Create `src/components/NavBar.jsx`:

```jsx
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function NavBar() {
  const { user, signOut } = useAuth()

  if (!user) {
    return null
  }

  return (
    <nav className="navbar">
      <Link to="/decks">Decks</Link>
      <Link to="/study">Study all due</Link>
      <span className="navbar-user">{user.user_metadata?.name ?? user.email}</span>
      <button onClick={() => signOut()}>Sign out</button>
    </nav>
  )
}
```

- [ ] **Step 5: Create placeholder route pages**

Create `src/routes/Decks.jsx`:

```jsx
export function Decks() {
  return <p>Decks page coming soon.</p>
}
```

Create `src/routes/DeckDetail.jsx`:

```jsx
export function DeckDetail() {
  return <p>Deck detail page coming soon.</p>
}
```

Create `src/routes/Study.jsx`:

```jsx
export function Study() {
  return <p>Study page coming soon.</p>
}
```

- [ ] **Step 6: Wire routing into App.jsx**

Replace the contents of `src/App.jsx`:

```jsx
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { NavBar } from './components/NavBar'
import { Login } from './routes/Login'
import { Decks } from './routes/Decks'
import { DeckDetail } from './routes/DeckDetail'
import { Study } from './routes/Study'
import './App.css'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <NavBar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/decks" element={<Decks />} />
            <Route path="/decks/:deckId" element={<DeckDetail />} />
            <Route path="/study" element={<Study />} />
            <Route path="/study/:deckId" element={<Study />} />
          </Route>
          <Route path="*" element={<Navigate to="/decks" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
```

- [ ] **Step 7: Configure Google OAuth in Supabase (manual, one-time)**

In the Supabase dashboard: Authentication → Providers → enable Google, following Supabase's instructions to create a Google Cloud OAuth client ID/secret and paste them in. Under Authentication → URL Configuration, add `http://localhost:5173` (and later your GitHub Pages URL) to the redirect URL allow-list.

- [ ] **Step 8: Manually verify the auth flow**

```bash
npm run dev
```

Open the app: it should redirect to `/#/login`. Click "Sign in with Google", complete the Google sign-in, and confirm you land back on `/#/decks` showing "Decks page coming soon." with the nav bar showing your name and a "Sign out" link. Click "Sign out" and confirm you're redirected back to the login page. Stop the server once confirmed.

- [ ] **Step 9: Commit**

```bash
git add src/context src/components/ProtectedRoute.jsx src/components/NavBar.jsx src/routes src/App.jsx
git commit -m "$(cat <<'EOF'
Add Google auth, protected routing, and nav bar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Decks page (list, create, publish, delete)

**Files:**
- Modify: `src/routes/Decks.jsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 4), `supabase` (Task 2).
- Produces: a working `/decks` page. No new exports consumed by later tasks (Task 6/8 link to `/decks/:deckId` and `/study/:deckId` by URL only).

- [ ] **Step 1: Implement the Decks page**

Replace the contents of `src/routes/Decks.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export function Decks() {
  const { user } = useAuth()
  const [ownDecks, setOwnDecks] = useState([])
  const [publicDecks, setPublicDecks] = useState([])
  const [newDeckName, setNewDeckName] = useState('')
  const [error, setError] = useState(null)

  async function loadDecks() {
    const [{ data: own, error: ownError }, { data: pub, error: pubError }] = await Promise.all([
      supabase
        .from('decks')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('decks')
        .select('*')
        .eq('is_public', true)
        .neq('owner_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    if (ownError || pubError) {
      setError((ownError ?? pubError).message)
      return
    }
    setOwnDecks(own)
    setPublicDecks(pub)
  }

  useEffect(() => {
    loadDecks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  async function createDeck(event) {
    event.preventDefault()
    const name = newDeckName.trim()
    if (!name) {
      return
    }
    const { error: insertError } = await supabase.from('decks').insert({ name, owner_id: user.id })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewDeckName('')
    loadDecks()
  }

  async function togglePublic(deck) {
    const { error: updateError } = await supabase
      .from('decks')
      .update({ is_public: !deck.is_public })
      .eq('id', deck.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    loadDecks()
  }

  async function deleteDeck(deck) {
    if (!window.confirm(`Delete deck "${deck.name}"? This deletes all its cards too.`)) {
      return
    }
    const { error: deleteError } = await supabase.from('decks').delete().eq('id', deck.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    loadDecks()
  }

  return (
    <div className="decks-page">
      {error && <p className="error">{error}</p>}

      <form onSubmit={createDeck}>
        <input
          value={newDeckName}
          onChange={(event) => setNewDeckName(event.target.value)}
          placeholder="New deck name"
        />
        <button type="submit">Create deck</button>
      </form>

      <h2>My decks</h2>
      {ownDecks.length === 0 && <p>No decks yet — create one above.</p>}
      <ul>
        {ownDecks.map((deck) => (
          <li key={deck.id}>
            <Link to={`/decks/${deck.id}`}>{deck.name}</Link>{' '}
            <Link to={`/study/${deck.id}`}>Study</Link>{' '}
            <label>
              <input
                type="checkbox"
                checked={deck.is_public}
                onChange={() => togglePublic(deck)}
              />
              Public
            </label>{' '}
            <button onClick={() => deleteDeck(deck)}>Delete</button>
          </li>
        ))}
      </ul>

      <h2>Public decks from other users</h2>
      {publicDecks.length === 0 && <p>No public decks yet.</p>}
      <ul>
        {publicDecks.map((deck) => (
          <li key={deck.id}>
            <Link to={`/decks/${deck.id}`}>{deck.name}</Link>{' '}
            <Link to={`/study/${deck.id}`}>Study</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Manually verify in the browser**

```bash
npm run dev
```

Signed in, on `/#/decks`: create a deck named "Test Deck", confirm it appears under "My decks". Check the "Public" checkbox and confirm it stays checked after a page refresh. Delete the deck (confirm dialog) and confirm it disappears.

To verify public-deck visibility, sign in with a second Google account in a private/incognito window, confirm the first account's public deck (if you leave one public) shows up under "Public decks from other users" but not under "My decks".

- [ ] **Step 3: Commit**

```bash
git add src/routes/Decks.jsx
git commit -m "$(cat <<'EOF'
Implement decks page: list, create, publish, delete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Deck detail page (cards list, add, delete)

**Files:**
- Create: `src/components/CardForm.jsx`
- Modify: `src/routes/DeckDetail.jsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 4), `supabase` (Task 2).
- Produces: `<CardForm deckId={string} onAdded={() => void} />` — a form that inserts a card and calls `onAdded` on success. Consumed by this task's `DeckDetail.jsx` and extended by Task 7 (`ImportForm` sits alongside it, not on top of it).

- [ ] **Step 1: Create the single-card add form**

Create `src/components/CardForm.jsx`:

```jsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'

export function CardForm({ deckId, onAdded }) {
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmedFront = front.trim()
    const trimmedBack = back.trim()
    if (!trimmedFront || !trimmedBack) {
      return
    }
    const { error: insertError } = await supabase
      .from('cards')
      .insert({ deck_id: deckId, front: trimmedFront, back: trimmedBack })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setFront('')
    setBack('')
    setError(null)
    onAdded()
  }

  return (
    <form onSubmit={handleSubmit} className="card-form">
      {error && <p className="error">{error}</p>}
      <input
        value={front}
        onChange={(event) => setFront(event.target.value)}
        placeholder="Front (question)"
      />
      <input
        value={back}
        onChange={(event) => setBack(event.target.value)}
        placeholder="Back (answer)"
      />
      <button type="submit">Add card</button>
    </form>
  )
}
```

- [ ] **Step 2: Implement the deck detail page**

Replace the contents of `src/routes/DeckDetail.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { CardForm } from '../components/CardForm'

export function DeckDetail() {
  const { deckId } = useParams()
  const { user } = useAuth()
  const [deck, setDeck] = useState(null)
  const [cards, setCards] = useState([])
  const [error, setError] = useState(null)

  async function load() {
    const [{ data: deckData, error: deckError }, { data: cardData, error: cardError }] =
      await Promise.all([
        supabase.from('decks').select('*').eq('id', deckId).single(),
        supabase.from('cards').select('*').eq('deck_id', deckId).order('created_at', { ascending: true }),
      ])

    if (deckError || cardError) {
      setError((deckError ?? cardError).message)
      return
    }
    setDeck(deckData)
    setCards(cardData)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  async function deleteCard(cardId) {
    const { error: deleteError } = await supabase.from('cards').delete().eq('id', cardId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  if (error) {
    return <p className="error">{error}</p>
  }
  if (!deck) {
    return <p>Loading…</p>
  }

  const isOwner = deck.owner_id === user.id

  return (
    <div className="deck-detail-page">
      <h1>{deck.name}</h1>
      <p>
        <Link to={`/study/${deck.id}`}>Study this deck</Link>
      </p>

      {isOwner && <CardForm deckId={deck.id} onAdded={load} />}

      {cards.length === 0 && <p>No cards yet.</p>}
      <ul>
        {cards.map((card) => (
          <li key={card.id}>
            <strong>{card.front}</strong> — {card.back}
            {isOwner && <button onClick={() => deleteCard(card.id)}>Delete</button>}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Manually verify in the browser**

```bash
npm run dev
```

Create a deck on `/#/decks`, click into it. Add two cards via the form and confirm they appear in the list. Delete one and confirm it disappears. Open the same deck's URL in the second (incognito) account from Task 5's public-deck test — if the deck is public, confirm the cards are visible but there's no add-card form and no delete buttons (not the owner).

- [ ] **Step 4: Commit**

```bash
git add src/components/CardForm.jsx src/routes/DeckDetail.jsx
git commit -m "$(cat <<'EOF'
Implement deck detail page: card list, add, delete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Bulk card import (CSV/JSON)

**Files:**
- Create: `src/lib/parseImport.js`
- Test: `src/lib/parseImport.test.js`
- Create: `src/components/ImportForm.jsx`
- Modify: `src/routes/DeckDetail.jsx`

**Interfaces:**
- Consumes: `supabase` (Task 2); modifies the `DeckDetail.jsx` produced in Task 6.
- Produces: `parseImportFile(text, filename)` → `Array<{ front: string, back: string }>` (throws `Error` on malformed input), and `<ImportForm deckId={string} onImported={() => void} />`.

- [ ] **Step 1: Write the failing tests for the parser**

Create `src/lib/parseImport.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseImportFile } from './parseImport'

describe('parseImportFile', () => {
  it('parses a JSON array of front/back objects', () => {
    const text = '[{"front":"Hello","back":"Bonjour"},{"front":"Dog","back":"Chien"}]'
    expect(parseImportFile(text, 'cards.json')).toEqual([
      { front: 'Hello', back: 'Bonjour' },
      { front: 'Dog', back: 'Chien' },
    ])
  })

  it('parses CSV with a header row', () => {
    const text = 'front,back\nHello,Bonjour\nDog,Chien\n'
    expect(parseImportFile(text, 'cards.csv')).toEqual([
      { front: 'Hello', back: 'Bonjour' },
      { front: 'Dog', back: 'Chien' },
    ])
  })

  it('parses CSV without a header row', () => {
    const text = 'Hello,Bonjour\nDog,Chien'
    expect(parseImportFile(text, 'cards.csv')).toEqual([
      { front: 'Hello', back: 'Bonjour' },
      { front: 'Dog', back: 'Chien' },
    ])
  })

  it('throws on a CSV line missing a comma', () => {
    expect(() => parseImportFile('Hello Bonjour', 'cards.csv')).toThrow('Line 1')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseImportFile('not json', 'cards.json')).toThrow('Invalid JSON')
  })

  it('throws on an unsupported file extension', () => {
    expect(() => parseImportFile('front,back', 'cards.txt')).toThrow('Unsupported file type')
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
npx vitest run src/lib/parseImport.test.js
```

Expected: FAIL — `src/lib/parseImport.js` does not exist yet.

- [ ] **Step 3: Implement the parser**

Create `src/lib/parseImport.js`:

```js
export function parseImportFile(text, filename) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.json')) {
    return parseJson(text)
  }
  if (lower.endsWith('.csv')) {
    return parseCsv(text)
  }
  throw new Error('Unsupported file type — use .csv or .json')
}

function parseJson(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error('Invalid JSON file')
  }
  if (!Array.isArray(data)) {
    throw new Error('JSON file must contain an array of {front, back} objects')
  }
  return data.map((entry, index) => {
    if (!entry || typeof entry.front !== 'string' || typeof entry.back !== 'string') {
      throw new Error(`Entry ${index + 1} is missing "front" or "back"`)
    }
    return { front: entry.front.trim(), back: entry.back.trim() }
  })
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const cards = []
  lines.forEach((line, index) => {
    if (index === 0 && line.toLowerCase() === 'front,back') {
      return
    }
    const commaIndex = line.indexOf(',')
    if (commaIndex === -1) {
      throw new Error(`Line ${index + 1} is not in "front,back" format`)
    }
    const front = line.slice(0, commaIndex).trim()
    const back = line.slice(commaIndex + 1).trim()
    if (!front || !back) {
      throw new Error(`Line ${index + 1} is missing a front or back value`)
    }
    cards.push({ front, back })
  })
  return cards
}
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
npx vitest run src/lib/parseImport.test.js
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Create the import form component**

Create `src/components/ImportForm.jsx`:

```jsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { parseImportFile } from '../lib/parseImport'

export function ImportForm({ deckId, onImported }) {
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(null)

  async function handleFileChange(event) {
    const file = event.target.files[0]
    if (!file) {
      return
    }
    setError(null)
    setStatus(null)

    try {
      const text = await file.text()
      const parsedCards = parseImportFile(text, file.name)
      if (parsedCards.length === 0) {
        setError('No cards found in file')
        return
      }
      const rows = parsedCards.map((card) => ({
        deck_id: deckId,
        front: card.front,
        back: card.back,
      }))
      const { error: insertError } = await supabase.from('cards').insert(rows)
      if (insertError) {
        setError(insertError.message)
        return
      }
      setStatus(`Imported ${rows.length} cards`)
      onImported()
    } catch (err) {
      setError(err.message)
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div className="import-form">
      <label>
        Import CSV/JSON
        <input type="file" accept=".csv,.json" onChange={handleFileChange} />
      </label>
      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Wire ImportForm into the deck detail page**

In `src/routes/DeckDetail.jsx`, add the import next to `import { CardForm } from '../components/CardForm'`:

```jsx
import { ImportForm } from '../components/ImportForm'
```

And render it alongside `CardForm` inside the `isOwner &&` block:

```jsx
      {isOwner && (
        <>
          <CardForm deckId={deck.id} onAdded={load} />
          <ImportForm deckId={deck.id} onImported={load} />
        </>
      )}
```

- [ ] **Step 7: Manually verify in the browser**

```bash
npm run dev
```

On a deck you own, use the file picker to import a small CSV file (create one locally, e.g. `test.csv` with contents `front,back\nCat,Chat\nHouse,Maison\n`) and confirm both cards appear in the list with a "Imported 2 cards" status message. Try importing a malformed file (e.g. a line with no comma) and confirm the error message appears and no cards are added.

- [ ] **Step 8: Commit**

```bash
git add src/lib/parseImport.js src/lib/parseImport.test.js src/components/ImportForm.jsx src/routes/DeckDetail.jsx
git commit -m "$(cat <<'EOF'
Add CSV/JSON bulk card import

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Study session (SM-2 review flow)

**Files:**
- Create: `src/hooks/useDueCards.js`
- Modify: `src/routes/Study.jsx`

**Interfaces:**
- Consumes: `sm2`, `DEFAULT_PROGRESS` (Task 3); `useAuth()` (Task 4); `supabase` (Task 2).
- Produces: `useDueCards(userId, deckId)` → `{ dueCards: Array<{ card, progress }>, loading, error, reload }`, where `deckId` is optional (omitted = all of the user's own decks). `card` is a row from `cards`; `progress` is the matching `card_progress` row or `null` if the card has never been reviewed.

- [ ] **Step 1: Implement the due-cards hook**

Create `src/hooks/useDueCards.js`:

```js
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export function useDueCards(userId, deckId) {
  const [dueCards, setDueCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let deckIds
    if (deckId) {
      deckIds = [deckId]
    } else {
      const { data: decks, error: decksError } = await supabase
        .from('decks')
        .select('id')
        .eq('owner_id', userId)
      if (decksError) {
        setError(decksError.message)
        setLoading(false)
        return
      }
      deckIds = decks.map((deck) => deck.id)
    }

    if (deckIds.length === 0) {
      setDueCards([])
      setLoading(false)
      return
    }

    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('*')
      .in('deck_id', deckIds)
    if (cardsError) {
      setError(cardsError.message)
      setLoading(false)
      return
    }

    const cardIds = cards.map((card) => card.id)
    const { data: progressRows, error: progressError } = cardIds.length
      ? await supabase.from('card_progress').select('*').eq('user_id', userId).in('card_id', cardIds)
      : { data: [], error: null }
    if (progressError) {
      setError(progressError.message)
      setLoading(false)
      return
    }

    const progressByCardId = new Map(progressRows.map((row) => [row.card_id, row]))
    const today = new Date().toISOString().slice(0, 10)

    const due = cards
      .map((card) => ({ card, progress: progressByCardId.get(card.id) ?? null }))
      .filter(({ progress }) => !progress || progress.due_date <= today)

    setDueCards(due)
    setLoading(false)
  }, [userId, deckId])

  useEffect(() => {
    load()
  }, [load])

  return { dueCards, loading, error, reload: load }
}
```

- [ ] **Step 2: Implement the Study page**

Replace the contents of `src/routes/Study.jsx`:

```jsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useDueCards } from '../hooks/useDueCards'
import { sm2, DEFAULT_PROGRESS } from '../lib/sm2'

export function Study() {
  const { deckId } = useParams()
  const { user } = useAuth()
  const { dueCards, loading, error } = useDueCards(user.id, deckId)
  const [index, setIndex] = useState(0)
  const [showBack, setShowBack] = useState(false)
  const [saveError, setSaveError] = useState(null)

  if (loading) {
    return <p>Loading…</p>
  }
  if (error) {
    return <p className="error">{error}</p>
  }
  if (dueCards.length === 0) {
    return <p>No cards due. Nice work.</p>
  }
  if (index >= dueCards.length) {
    return <p>Session complete. No more cards due.</p>
  }

  const { card, progress } = dueCards[index]

  async function grade(gradeValue) {
    const previous = progress
      ? {
          easeFactor: Number(progress.ease_factor),
          intervalDays: progress.interval_days,
          repetitions: progress.repetitions,
        }
      : DEFAULT_PROGRESS

    const next = sm2(previous, gradeValue)

    const { error: upsertError } = await supabase.from('card_progress').upsert(
      {
        user_id: user.id,
        card_id: card.id,
        ease_factor: next.easeFactor,
        interval_days: next.intervalDays,
        repetitions: next.repetitions,
        due_date: next.dueDate,
        last_reviewed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,card_id' }
    )

    if (upsertError) {
      setSaveError(upsertError.message)
      return
    }

    setShowBack(false)
    setIndex((current) => current + 1)
  }

  return (
    <div className="study-page">
      {saveError && <p className="error">{saveError}</p>}
      <p>
        Card {index + 1} of {dueCards.length}
      </p>
      <div className="study-card">
        <p className="front">{card.front}</p>
        {showBack && <p className="back">{card.back}</p>}
      </div>

      {!showBack ? (
        <button onClick={() => setShowBack(true)}>Show answer</button>
      ) : (
        <div className="grade-buttons">
          <button onClick={() => grade('again')}>Again</button>
          <button onClick={() => grade('hard')}>Hard</button>
          <button onClick={() => grade('good')}>Good</button>
          <button onClick={() => grade('easy')}>Easy</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Manually verify in the browser**

```bash
npm run dev
```

Add a few cards to a deck if you don't already have some. Go to `/#/study/<deckId>` (via the deck's "Study" link) and confirm the first card's front shows, "Show answer" reveals the back and the four grade buttons, and clicking a grade advances to the next card. After grading every due card, confirm "Session complete." shows. Reload the page immediately after — a card graded "Again" should reappear (its due date is today), while one graded "Easy" should not. Also try `/#/study` (no deck id) from the nav bar "Study all due" link and confirm it pulls due cards from all of your own decks.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useDueCards.js src/routes/Study.jsx
git commit -m "$(cat <<'EOF'
Implement SM-2 study session

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Deploy to GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: the full app from Tasks 1–8.
- Produces: an automated build+deploy pipeline; no code interfaces consumed by other tasks (this is the last task).

- [ ] **Step 1: Write the GitHub Actions workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write setup instructions**

Create `README.md`:

```markdown
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
```

- [ ] **Step 3: Verify the production build locally**

```bash
npm run build
npm run preview
```

Expected: the build completes with no errors, and `npm run preview` serves the production build; open it and confirm the login page loads correctly at the printed local URL (auth against your real Supabase project should also work here since `localhost` is in the redirect allow-list).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "$(cat <<'EOF'
Add GitHub Actions deploy workflow and setup README

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Push and complete GitHub-side setup (manual)**

Push the repo to a new GitHub repository, then follow the "GitHub Pages deployment" steps in the README (Pages source, Actions secrets). After the first successful workflow run, add the deployed `https://<username>.github.io/<repo>/` URL to Supabase's redirect URL allow-list (step 1 above already told you to do this — just confirm it's actually there once you know the real URL) and confirm sign-in works on the live site.

---

## Self-Review Notes

- **Spec coverage:** folders/decks (Task 5), cards with plain text front/back (Task 6), SM-2 algorithm matching Anki's grade buttons (Task 3, 8), multi-user with Google auth (Task 4), private-by-default + publishable decks with per-user progress on shared decks (Task 2 RLS + Task 5 UI + `card_progress` unique-per-user design), single-card add (Task 6) and CSV/JSON bulk import (Task 7), GitHub Pages static hosting via Actions (Task 9). All spec sections are covered.
- **Placeholder scan:** the only "coming soon" stubs (Task 4, Step 5) are real working components wired into real routes, immediately replaced by their owning tasks (5, 6, 8) — not unresolved plan placeholders.
- **Type/interface consistency:** verified `sm2()`'s parameter and return shape is used identically in Task 8's `Study.jsx`; `useAuth()`'s `{ user, loading, signInWithGoogle, signOut }` shape is used identically in Login, ProtectedRoute, NavBar, and all data-fetching pages; `parseImportFile()`'s return shape (`{ front, back }` objects) matches what `ImportForm.jsx` maps into `cards` insert rows.
