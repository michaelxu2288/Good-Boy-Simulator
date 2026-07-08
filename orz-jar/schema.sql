-- orz jar — database schema
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to re-run (idempotent). Keeps data small for the free tier: short/capped columns, no bloat.

-- ============================================================ members
create table if not exists public.members (
  id           text primary key,            -- 'michael' | 'james' | 'mzwu' | 'liam'
  display_name text not null,
  pin          text not null default '0000',-- placeholder; change later
  color        text not null                -- hex, for token color-coding (placeholder for now)
);

-- ============================================================ tokens (one per orz)
create table if not exists public.tokens (
  id           uuid primary key default gen_random_uuid(),
  culprit      text not null references public.members(id),   -- whose jar it counts for
  submitted_by text not null references public.members(id),   -- who filed it
  where_said   text,                                          -- optional: 'orz house'|'gc'|'dm'|'outside'
  note         varchar(280),                                  -- optional context/quote, capped small
  occurred_at  timestamptz,                                   -- optional: when it actually happened (blank by default)
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),            -- used to order the "latest 8" stack
  resolved_at  timestamptz
);
create index if not exists tokens_status_created_idx on public.tokens(status, created_at desc);
create index if not exists tokens_culprit_idx        on public.tokens(culprit);

-- ============================================================ votes (one per person per token)
create table if not exists public.votes (
  id         uuid primary key default gen_random_uuid(),
  token_id   uuid not null references public.tokens(id) on delete cascade,
  voter      text not null references public.members(id),
  vote       text not null check (vote in ('approve','reject')),
  created_at timestamptz not null default now(),
  unique (token_id, voter)                                    -- one vote per person; upsert to change
);
create index if not exists votes_token_idx on public.votes(token_id);

-- ============================================================ resolution trigger
-- recount after every vote change: 2+ approve => approved, 2+ reject => rejected.
create or replace function public.resolve_token()
returns trigger language plpgsql
security definer set search_path = public as $$
declare
  tid      uuid;
  approves int;
  rejects  int;
  cur      text;
begin
  tid := coalesce(new.token_id, old.token_id);

  -- the token may already be gone (its votes cascade-delete during a reject-purge,
  -- which re-fires this trigger). only act while it's still an open pending ticket.
  select status into cur from public.tokens where id = tid;
  if cur is null or cur <> 'pending' then
    return null;
  end if;

  select count(*) filter (where vote = 'approve'),
         count(*) filter (where vote = 'reject')
    into approves, rejects
    from public.votes where token_id = tid;

  if approves >= 2 then
    update public.tokens set status = 'approved', resolved_at = now()
      where id = tid and status = 'pending';
  elsif rejects >= 2 then
    -- rejected tickets just VANISH (votes cascade with them). free-tier bloat control:
    -- the table only ever holds pending + approved rows, never a pile of rejects.
    delete from public.tokens where id = tid;
  end if;
  return null;
end $$;

drop trigger if exists trg_resolve_token on public.votes;
create trigger trg_resolve_token
  after insert or update or delete on public.votes
  for each row execute function public.resolve_token();

-- ============================================================ auto-approve by submitter
-- the submitter's own word counts as 1 approve, so only 1 more approval enters the jar.
create or replace function public.seed_submitter_vote()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  insert into public.votes (token_id, voter, vote)
  values (new.id, new.submitted_by, 'approve')
  on conflict (token_id, voter) do nothing;
  return null;
end $$;

drop trigger if exists trg_seed_submitter_vote on public.tokens;
create trigger trg_seed_submitter_vote
  after insert on public.tokens
  for each row execute function public.seed_submitter_vote();

-- ============================================================ per-member approved counts
-- cheap read for the counters/leaderboard (no need to pull all rows to the client).
create or replace view public.member_counts as
  select m.id,
         m.display_name,
         m.color,
         count(t.id) filter (where t.status = 'approved') as approved_count
    from public.members m
    left join public.tokens t on t.culprit = m.id
   group by m.id, m.display_name, m.color;

grant select on public.member_counts to anon, authenticated;

-- ============================================================ pin-safe access
-- NEVER expose members.pin to the browser. the client reads members through a
-- pin-less view and verifies pins via a security-definer rpc (pin never leaves the db).
create or replace view public.members_public as
  select id, display_name, color from public.members;

create or replace function public.verify_pin(p_id text, p_pin text)
returns boolean
language sql
security definer
set search_path = public
as $$ select exists (select 1 from public.members where id = p_id and pin = p_pin) $$;

-- lock down the base members table; anon only ever touches the view + rpc.
revoke all on public.members from anon, authenticated;
grant select on public.members_public to anon, authenticated;
grant execute on function public.verify_pin(text, text) to anon, authenticated;

-- ============================================================ pending queue w/ tallies
-- one row per pending token with approve/reject counts, so the client does one round-trip.
create or replace view public.pending_tokens as
  select t.*,
         count(*) filter (where v.vote = 'approve') as approves,
         count(*) filter (where v.vote = 'reject')  as rejects
    from public.tokens t
    left join public.votes v on v.token_id = t.id
   where t.status = 'pending'
   group by t.id;

grant select on public.pending_tokens to anon, authenticated;

-- ============================================================ retract (self-undo)
-- pull a ticket back while it's still fresh & unresolved. security-definer so it can
-- delete under the locked-down RLS below; scoped to pending + <30s so it can't nuke
-- established tickets. (no real auth here, so it can't cryptographically prove "your
-- own" ticket -- fine for a 4-friend trust model; the client only calls it on yours.)
create or replace function public.retract_token(p_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.tokens
     where id = p_id
       and status = 'pending'
       and created_at > now() - interval '30 seconds'
    returning 1
  )
  select exists (select 1 from gone);
$$;

grant execute on function public.retract_token(uuid) to anon, authenticated;

-- ============================================================ seed the 4 members (pin 0000)
-- colors are PLACEHOLDERS; they'll be updated once we lock the design palette.
insert into public.members (id, display_name, pin, color) values
  ('michael','Michael','0000','#e8734a'),
  ('james',  'James',  '0000','#4a8fe8'),
  ('mzwu',   'Mzwu',   '0000','#57b894'),
  ('liam',   'Liam',   '0000','#c05fd0')
on conflict (id) do nothing;

-- ============================================================ realtime (idempotent)
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='tokens') then
    alter publication supabase_realtime add table public.tokens;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='votes') then
    alter publication supabase_realtime add table public.votes;
  end if;
end $$;

-- ============================================================ RLS (locked down)
-- there is NO supabase auth here: every browser request is the `anon` role holding
-- the public publishable key, so RLS can't cryptographically bind a write to a person
-- (spoofing submitted_by / voter is only truly fixable with real auth -- acceptable
-- for a 4-friend trust model). what it CAN pin down, and does below, is the SHAPE of
-- what anon may do:
--   * tokens: read all; insert ONLY a fresh 'pending' ticket (no self-approving
--     straight into the jar); NO direct update/delete -- status changes only through
--     the vetted vote -> resolve_token() (security-definer), retract via the rpc.
--   * votes:  read all; insert/flip only 'approve'|'reject'; NO delete (can't erase
--     votes to game a resolution).
--   * members: unchanged -- fully hidden from anon; pin-safe via view + verify_pin rpc.
alter table public.members enable row level security;
alter table public.tokens  enable row level security;
alter table public.votes   enable row level security;

-- drop every policy name we've ever used so this whole file stays re-runnable.
drop policy if exists members_all    on public.members;   -- members has no anon policy at all
drop policy if exists tokens_all     on public.tokens;
drop policy if exists votes_all      on public.votes;
drop policy if exists tokens_read    on public.tokens;
drop policy if exists tokens_insert  on public.tokens;
drop policy if exists votes_read     on public.votes;
drop policy if exists votes_insert   on public.votes;
drop policy if exists votes_update   on public.votes;

-- belt-and-suspenders: pull the table grants anon should never exercise anyway
-- (the security-definer functions above run as owner, so triggers/rpc still work).
revoke update, delete on public.tokens from anon, authenticated;
revoke delete          on public.votes  from anon, authenticated;

-- tokens: world-readable; every insert must be a clean, unresolved pending ticket.
create policy tokens_read   on public.tokens for select using (true);
create policy tokens_insert on public.tokens for insert
  with check (status = 'pending' and resolved_at is null);
-- (no update/delete policy => anon can't; resolve_token() & retract_token() are definer.)

-- votes: world-readable; anon may cast/flip an approve|reject, never delete.
create policy votes_read   on public.votes for select using (true);
create policy votes_insert on public.votes for insert
  with check (vote in ('approve','reject'));
create policy votes_update on public.votes for update
  using (true) with check (vote in ('approve','reject'));
-- (no delete policy => anon can't erase votes; seed_submitter_vote() is definer.)
