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
drop policy if exists "decks_select" on decks;
create policy "decks_select" on decks
  for select using (owner_id = auth.uid() or is_public = true);

drop policy if exists "decks_insert" on decks;
create policy "decks_insert" on decks
  for insert with check (owner_id = auth.uid());

drop policy if exists "decks_update" on decks;
create policy "decks_update" on decks
  for update using (owner_id = auth.uid());

drop policy if exists "decks_delete" on decks;
create policy "decks_delete" on decks
  for delete using (owner_id = auth.uid());

-- cards: readable if the parent deck is owned by the caller or public;
-- writable only if the parent deck is owned by the caller
drop policy if exists "cards_select" on cards;
create policy "cards_select" on cards
  for select using (
    exists (
      select 1 from decks d
      where d.id = cards.deck_id
        and (d.owner_id = auth.uid() or d.is_public = true)
    )
  );

drop policy if exists "cards_insert" on cards;
create policy "cards_insert" on cards
  for insert with check (
    exists (select 1 from decks d where d.id = cards.deck_id and d.owner_id = auth.uid())
  );

drop policy if exists "cards_update" on cards;
create policy "cards_update" on cards
  for update using (
    exists (select 1 from decks d where d.id = cards.deck_id and d.owner_id = auth.uid())
  );

drop policy if exists "cards_delete" on cards;
create policy "cards_delete" on cards
  for delete using (
    exists (select 1 from decks d where d.id = cards.deck_id and d.owner_id = auth.uid())
  );

-- card_progress: strictly per-user, regardless of who owns the deck
drop policy if exists "progress_select" on card_progress;
create policy "progress_select" on card_progress
  for select using (user_id = auth.uid());

drop policy if exists "progress_insert" on card_progress;
create policy "progress_insert" on card_progress
  for insert with check (user_id = auth.uid());

drop policy if exists "progress_update" on card_progress;
create policy "progress_update" on card_progress
  for update using (user_id = auth.uid());

drop policy if exists "progress_delete" on card_progress;
create policy "progress_delete" on card_progress
  for delete using (user_id = auth.uid());
