-- RLS performance: evaluate auth helpers once per query, not once per row.
--
-- Postgres re-runs is_admin() / current_user_role() / auth.uid() for EVERY row a
-- policy checks. Wrapping them in (select ...) turns each into an InitPlan that
-- runs once per statement (Supabase's documented fix:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).
--
-- Access rules are unchanged. ALTER POLICY keeps each policy's command and roles;
-- if a policy differs from the repo, this whole migration fails and rolls back.
--
-- Generated from the latest definition of each policy in supabase/migrations.

begin;

-- One query instead of is_admin() + current_user_role() + counselor_in_scope()
-- (three separate lookups) per call. Same result.
create or replace function public.counselor_can_access_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from leads l
    join users u on u.id = auth.uid() and u.active = true
    where l.id = p_lead_id
      and (
        u.role = 'admin'
        or (
          u.role = 'counselor'
          and (l.lead_allocated_to = u.id or l.lead_allocated_to is null)
          and exists (
            select 1 from counselor_scope s
            where s.user_id = u.id
              and (l.course_id is null or s.course_id = l.course_id)
              and (l.cohort_id is null or s.cohort_id = l.cohort_id)
          )
        )
      )
  );
$$;

create or replace function public.is_admin_or_marketing()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users
    where id = auth.uid() and active = true and role in ('admin', 'marketing')
  );
$$;


alter policy users_insert on public.users
  with check ((select public.is_admin()));

alter policy users_update on public.users
  using ((select public.is_admin()) or id = (select auth.uid()))
  with check ((select public.is_admin()) or id = (select auth.uid()));

alter policy users_delete on public.users
  using ((select public.is_admin()));

alter policy courses_write on public.courses
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy cohorts_write on public.cohorts
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy scope_select on public.counselor_scope
  using ((select public.is_admin()) or user_id = (select auth.uid()));

alter policy scope_write on public.counselor_scope
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy leads_insert on public.leads
  with check (
    (select public.is_admin())
    or (
      (select public.current_user_role()) = 'counselor'
      and (lead_allocated_to = (select auth.uid()) or lead_allocated_to is null)
      and exists (
        select 1 from public.counselor_scope s
        where s.user_id = (select auth.uid())
          and (leads.course_id is null or s.course_id = leads.course_id)
          and (leads.cohort_id is null or s.cohort_id = leads.cohort_id)
      )
    ));

alter policy leads_update on public.leads
  using (
    (select public.is_admin())
    or (
      (select public.current_user_role()) = 'counselor'
      and (lead_allocated_to = (select auth.uid()) or lead_allocated_to is null)
      and exists (
        select 1 from public.counselor_scope s
        where s.user_id = (select auth.uid())
          and (leads.course_id is null or s.course_id = leads.course_id)
          and (leads.cohort_id is null or s.cohort_id = leads.cohort_id)
      )
    ))
  with check (
    (select public.is_admin())
    or (
      (select public.current_user_role()) = 'counselor'
      and exists (
        select 1 from public.counselor_scope s
        where s.user_id = (select auth.uid())
          and (leads.course_id is null or s.course_id = leads.course_id)
          and (leads.cohort_id is null or s.cohort_id = leads.cohort_id)
      )
    ));

alter policy leads_delete on public.leads
  using ((select public.is_admin()));

alter policy stage_history_select on public.stage_history
  using ((select public.is_admin()) or counselor_can_access_lead(lead_id) or exists (
    select 1 from interview_bookings b
    where b.lead_id = stage_history.lead_id and b.interviewer_id = (select auth.uid())
  ));

alter policy stage_history_insert on public.stage_history
  with check (counselor_can_access_lead(lead_id) or (select public.is_admin()));

alter policy call_logs_select on public.call_logs
  using ((select public.is_admin()) or counselor_can_access_lead(lead_id));

alter policy call_logs_insert on public.call_logs
  with check (((select public.is_admin()) or counselor_can_access_lead(lead_id))
    and counselor_id = (select auth.uid()));

alter policy call_logs_update on public.call_logs
  using ((select public.is_admin()) or (counselor_id = (select auth.uid()) and counselor_can_access_lead(lead_id)));

alter policy avail_select on public.interviewer_availability
  using ((select public.is_admin())
    or interviewer_id = (select auth.uid())
    or (select public.current_user_role()) = 'counselor');

alter policy avail_write on public.interviewer_availability
  using ((select public.is_admin()) or interviewer_id = (select auth.uid()))
  with check ((select public.is_admin()) or interviewer_id = (select auth.uid()));

alter policy bookings_select on public.interview_bookings
  using ((select public.is_admin())
    or interviewer_id = (select auth.uid())
    or counselor_can_access_lead(lead_id));

alter policy bookings_insert on public.interview_bookings
  with check ((select public.is_admin()) or counselor_can_access_lead(lead_id));

alter policy bookings_update on public.interview_bookings
  using ((select public.is_admin())
    or interviewer_id = (select auth.uid())
    or counselor_can_access_lead(lead_id))
  with check ((select public.is_admin())
    or interviewer_id = (select auth.uid())
    or counselor_can_access_lead(lead_id));

alter policy installments_select on public.installments
  using (exists (
    select 1 from fee_records f
    where f.id = installments.fee_record_id
      and ((select public.is_admin()) or counselor_can_access_lead(f.lead_id))
  ));

alter policy installments_write on public.installments
  using (exists (
    select 1 from fee_records f
    where f.id = installments.fee_record_id
      and ((select public.is_admin()) or counselor_can_access_lead(f.lead_id))
  ))
  with check (exists (
    select 1 from fee_records f
    where f.id = installments.fee_record_id
      and ((select public.is_admin()) or counselor_can_access_lead(f.lead_id))
  ));

alter policy loans_select on public.loans
  using (exists (
    select 1 from fee_records f
    where f.id = loans.fee_record_id
      and ((select public.is_admin()) or counselor_can_access_lead(f.lead_id))
  ));

alter policy loans_write on public.loans
  using (exists (
    select 1 from fee_records f
    where f.id = loans.fee_record_id
      and ((select public.is_admin()) or counselor_can_access_lead(f.lead_id))
  ))
  with check (exists (
    select 1 from fee_records f
    where f.id = loans.fee_record_id
      and ((select public.is_admin()) or counselor_can_access_lead(f.lead_id))
  ));

alter policy vendors_select on public.loan_vendors
  using ((select public.is_admin()) or (select public.current_user_role()) = 'counselor');

alter policy vendors_write on public.loan_vendors
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy settings_write on public.app_settings
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy leads_select on public.leads
  using (
    (select public.is_admin())
    or (select public.is_marketing())
    or (
      (select public.current_user_role()) = 'counselor'
      and (lead_allocated_to = (select auth.uid()) or lead_allocated_to is null)
      and exists (
        select 1 from public.counselor_scope s
        where s.user_id = (select auth.uid())
          and (leads.course_id is null or s.course_id = leads.course_id)
          and (leads.cohort_id is null or s.cohort_id = leads.cohort_id)
      )
    )
    or (
      (select public.current_user_role()) = 'interviewer'
      and exists (
        select 1 from public.interview_bookings b
        where b.lead_id = leads.id and b.interviewer_id = (select auth.uid())
      )
    ));

alter policy users_select on public.users
  using ((select public.is_admin()) or id = (select auth.uid()) or (select public.current_user_role()) in ('counselor', 'interviewer', 'marketing'));

alter policy channels_select on public.channels
  using ((select public.is_admin_or_marketing()) or (select public.current_user_role()) = 'counselor');

alter policy channels_write on public.channels
  using ((select public.is_admin_or_marketing()))
  with check ((select public.is_admin_or_marketing()));

alter policy campaigns_select on public.campaigns
  using ((select public.is_admin_or_marketing()) or (select public.current_user_role()) = 'counselor');

alter policy campaigns_write on public.campaigns
  using ((select public.is_admin_or_marketing()))
  with check ((select public.is_admin_or_marketing()));

alter policy ad_creatives_select on public.ad_creatives
  using ((select public.is_admin_or_marketing()) or (select public.current_user_role()) = 'counselor');

alter policy ad_creatives_write on public.ad_creatives
  using ((select public.is_admin_or_marketing()))
  with check ((select public.is_admin_or_marketing()));

alter policy visitor_sessions_select on public.visitor_sessions
  using ((select public.is_admin_or_marketing())
    or ((select public.current_user_role()) = 'counselor' and session_linked_to_accessible_lead(id)));

alter policy visitor_sessions_write on public.visitor_sessions
  using ((select public.is_admin_or_marketing()))
  with check ((select public.is_admin_or_marketing()));

alter policy page_events_select on public.page_events
  using ((select public.is_admin_or_marketing())
    or ((select public.current_user_role()) = 'counselor' and session_linked_to_accessible_lead(session_id)));

alter policy page_events_write on public.page_events
  using ((select public.is_admin_or_marketing()))
  with check ((select public.is_admin_or_marketing()));

alter policy heatmap_points_select on public.heatmap_points
  using ((select public.is_admin_or_marketing()));

alter policy heatmap_points_write on public.heatmap_points
  using ((select public.is_admin_or_marketing()))
  with check ((select public.is_admin_or_marketing()));

alter policy lead_attribution_select on public.lead_attribution
  using ((select public.is_admin_or_marketing())
    or ((select public.current_user_role()) = 'counselor' and counselor_can_access_lead(lead_id)));

alter policy lead_attribution_write on public.lead_attribution
  using ((select public.is_admin_or_marketing()))
  with check ((select public.is_admin_or_marketing()));

alter policy ad_platform_connections_admin on public.ad_platform_connections
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy ad_spend_daily_select on public.ad_spend_daily
  using ((select public.is_admin_or_marketing()));

alter policy ad_spend_daily_write on public.ad_spend_daily
  using ((select public.is_admin_or_marketing()))
  with check ((select public.is_admin_or_marketing()));

alter policy stage_trigger_rules_admin on public.stage_trigger_rules
  using (exists (select 1 from users u where u.id = (select auth.uid()) and u.role = 'admin'))
  with check (exists (select 1 from users u where u.id = (select auth.uid()) and u.role = 'admin'));

alter policy message_logs_select on public.message_logs
  using (exists (select 1 from users u where u.id = (select auth.uid()) and u.role in ('admin', 'counselor', 'marketing'))
    or exists (
      select 1 from leads l
      where l.id = message_logs.lead_id and l.lead_allocated_to = (select auth.uid())
    ));

alter policy lead_touchpoints_select on public.lead_touchpoints
  using (exists (select 1 from users u where u.id = (select auth.uid()) and u.role in ('admin', 'counselor', 'marketing'))
    or exists (
      select 1 from leads l
      where l.id = lead_touchpoints.lead_id and l.lead_allocated_to = (select auth.uid())
    ));

alter policy unmatched_calls_admin on public.unmatched_calls
  using (exists (select 1 from users u where u.id = (select auth.uid()) and u.role = 'admin'))
  with check (exists (select 1 from users u where u.id = (select auth.uid()) and u.role = 'admin'));

alter policy counselor_program_alloc_admin on public.counselor_program_alloc
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy counselor_program_alloc_self_read on public.counselor_program_alloc
  using (user_id = (select auth.uid()) or (select public.is_admin()));

alter policy lead_panelist_grades_read on public.lead_panelist_grades
  using ((select public.is_admin())
    or counselor_can_access_lead(lead_id)
    or panelist_id = (select auth.uid())
    or (select public.current_user_role()) = 'interviewer');

alter policy lead_panelist_grades_write on public.lead_panelist_grades
  using ((select public.is_admin()) or panelist_id = (select auth.uid()))
  with check ((select public.is_admin()) or panelist_id = (select auth.uid()));

alter policy message_sequences_admin on public.message_sequences
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy message_sequence_steps_admin on public.message_sequence_steps
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy lead_approvals_write on public.lead_approvals
  using (exists (
      select 1 from users u
      where u.id = (select auth.uid())
        and u.role in ('admin', 'interviewer')
        and u.active = true
    ))
  with check (exists (
      select 1 from users u
      where u.id = (select auth.uid())
        and u.role in ('admin', 'interviewer')
        and u.active = true
    ));

alter policy fee_records_select on public.fee_records
  using ((select public.is_admin())
    or exists (
      select 1 from users u
      where u.id = (select auth.uid()) and u.active and u.role in ('program', 'counselor')
    ));

alter policy fee_records_write on public.fee_records
  using ((select public.is_admin())
    or exists (
      select 1 from users u
      where u.id = (select auth.uid()) and u.active and u.role in ('program', 'counselor')
    ))
  with check ((select public.is_admin())
    or exists (
      select 1 from users u
      where u.id = (select auth.uid()) and u.active and u.role in ('program', 'counselor')
    ));

alter policy funnel_groups_admin on public.funnel_groups
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy funnel_stages_admin on public.funnel_stages
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy funnel_transitions_admin on public.funnel_transitions
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy lead_stage_scores_read on public.lead_stage_scores
  using (exists (select 1 from users u where u.id = (select auth.uid()) and u.active));

alter policy lead_stage_scores_write on public.lead_stage_scores
  with check (scored_by = (select auth.uid())
    and exists (
      select 1 from users u
      where u.id = (select auth.uid()) and u.active
        and u.role in ('admin', 'counselor', 'interviewer')
    ));

alter policy call_logs_delete on public.call_logs
  using ((select public.is_admin())
    or counselor_can_access_lead(lead_id));

alter policy lead_tasks_select on public.lead_tasks
  using ((select public.is_admin()) or counselor_can_access_lead(lead_id));

alter policy lead_tasks_insert on public.lead_tasks
  with check (((select public.is_admin()) or counselor_can_access_lead(lead_id))
    and created_by = (select auth.uid()));

alter policy lead_tasks_update on public.lead_tasks
  using ((select public.is_admin()) or counselor_can_access_lead(lead_id))
  with check ((select public.is_admin()) or counselor_can_access_lead(lead_id));

alter policy lead_tasks_delete on public.lead_tasks
  using ((select public.is_admin()) or counselor_can_access_lead(lead_id));

alter policy funnel_profiles_admin on public.funnel_profiles
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

commit;
