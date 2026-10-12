-- ============================================================================
-- Orbital X — Task pay ("Paid" button) migration
-- ============================================================================
-- Run this once in your Supabase project's SQL Editor. Safe to re-run.
--
-- What it's for: tasks done in a week are paid the following Friday, so the
-- Task log now keeps a finished week visible (marked "Unpaid") until an
-- admin clicks Paid for that tasker in Admin → Tasker view. Each Paid click
-- saves one row here per week it settles; that row is what takes the week
-- out of the tasker's Task log, and what the "Paid history" list shows.
--
-- Nothing else changes: task_logs (the grids themselves) are untouched, so
-- paying a week never deletes what the tasker marked.
-- ============================================================================

create table if not exists task_payouts (
  id            text primary key,
  -- ON DELETE CASCADE: deleting an employee in the app also removes their
  -- payout history, the same way their other records are cleared.
  employee_id   text not null references employees(id) on delete cascade,
  -- Monday of the week that was paid, e.g. 2026-10-05.
  week_start    date not null,
  -- How many hour/task slots were marked that week, at the moment it was
  -- marked paid (a snapshot, so later edits can't change the record).
  marked_count  integer not null default 0,
  paid_at       timestamptz not null default now(),
  -- The admin who clicked Paid.
  paid_by       text,
  -- A week can only be paid once per tasker.
  constraint task_payouts_employee_week_unique unique (employee_id, week_start)
);

create index if not exists task_payouts_employee_idx on task_payouts (employee_id);

-- Same access model as the app's other tables: the app talks to Supabase
-- with its public key, so that key needs read/write on this table.
alter table task_payouts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'task_payouts' and policyname = 'Orbital task_payouts access'
  ) then
    create policy "Orbital task_payouts access" on task_payouts
      for all to anon using (true) with check (true);
  end if;
end $$;

grant select, insert, update, delete on task_payouts to anon, authenticated;
