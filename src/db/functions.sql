-- ============================================================
-- claim_next_task
-- Atomically claims the next eligible pending task (respecting scheduled_for),
-- picking one task per organization ordered by priority then age.
-- ============================================================
create or replace function claim_next_task()
returns setof agent_tasks
language plpgsql
as $$
begin
  return query
  with candidates as (
    select id, organization_id
    from agent_tasks
    where status = 'pending'
      and (scheduled_for is null or scheduled_for <= now())
    order by organization_id, priority asc, created_at asc
    for update skip locked
  ),
  chosen as (
    select distinct on (organization_id) id
    from candidates
    order by organization_id, priority asc, created_at asc
  )
  update agent_tasks a
  set
    status     = 'processing',
    updated_at = now()
  from chosen c
  where a.id = c.id
  returning a.*;
end;
$$;

-- ============================================================
-- handle_new_org
-- Auto-creates an organizations row when a new Supabase auth user signs up.
-- ============================================================
create or replace function public.handle_new_org()
returns trigger as $$
begin
  insert into public.organizations (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_org();

-- ============================================================
-- set_updated_at
-- Generic trigger function to keep updated_at current.
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_inventory_items_updated_at
  before update on inventory_items
  for each row execute procedure set_updated_at();

create trigger trg_agent_tasks_updated_at
  before update on agent_tasks
  for each row execute procedure set_updated_at();
