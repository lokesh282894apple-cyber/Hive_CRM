-- Fast data extractors for Analytics Funnel to bypass PostgREST 1000-row pagination and OFFSET timeouts

CREATE OR REPLACE FUNCTION rpc_funnel_visitor_sessions(p_from timestamp with time zone, p_to timestamp with time zone)
RETURNS TABLE (id uuid, first_seen_at timestamp with time zone) 
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, first_seen_at FROM visitor_sessions
  WHERE first_seen_at >= p_from AND first_seen_at <= p_to;
$$;

CREATE OR REPLACE FUNCTION rpc_funnel_leads(p_from timestamp with time zone, p_to timestamp with time zone)
RETURNS TABLE (
  id uuid, 
  created_at timestamp with time zone, 
  programme text, 
  cohort_id uuid, 
  source text, 
  utm_medium text, 
  aql_at timestamp with time zone, 
  qualification_intent text, 
  financial_check text, 
  stage text
) 
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, created_at, programme, cohort_id, source, utm_medium, aql_at, qualification_intent, financial_check, stage 
  FROM leads
  WHERE created_at >= p_from AND created_at <= p_to;
$$;

CREATE OR REPLACE FUNCTION rpc_funnel_stage_history(p_from timestamp with time zone, p_to timestamp with time zone)
RETURNS TABLE (lead_id uuid, to_stage text, changed_at timestamp with time zone) 
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT lead_id, to_stage, changed_at 
  FROM stage_history
  WHERE changed_at >= p_from AND changed_at <= p_to;
$$;
