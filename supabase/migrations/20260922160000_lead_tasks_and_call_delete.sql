-- Call delete access + counselor lead tasks
-- Widen call_logs delete so anyone who can access the lead can remove a log.
-- Add lead_tasks for callback / follow-up reminders.

drop policy if exists call_logs_delete on call_logs;
create policy call_logs_delete on call_logs for delete to authenticated
  using (
    is_admin()
    or counselor_can_access_lead(lead_id)
  );

create table if not exists lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  title text not null,
  notes text,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_by uuid references users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists lead_tasks_lead_idx on lead_tasks (lead_id, status, due_at);
create index if not exists lead_tasks_due_idx on lead_tasks (status, due_at)
  where status = 'open';

alter table lead_tasks enable row level security;

drop policy if exists lead_tasks_select on lead_tasks;
create policy lead_tasks_select on lead_tasks for select to authenticated
  using (is_admin() or counselor_can_access_lead(lead_id));

drop policy if exists lead_tasks_insert on lead_tasks;
create policy lead_tasks_insert on lead_tasks for insert to authenticated
  with check (
    (is_admin() or counselor_can_access_lead(lead_id))
    and created_by = auth.uid()
  );

drop policy if exists lead_tasks_update on lead_tasks;
create policy lead_tasks_update on lead_tasks for update to authenticated
  using (is_admin() or counselor_can_access_lead(lead_id))
  with check (is_admin() or counselor_can_access_lead(lead_id));

drop policy if exists lead_tasks_delete on lead_tasks;
create policy lead_tasks_delete on lead_tasks for delete to authenticated
  using (is_admin() or counselor_can_access_lead(lead_id));

comment on table lead_tasks is 'Counselor reminders / callbacks attached to a lead';
