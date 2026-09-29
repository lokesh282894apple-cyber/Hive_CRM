CREATE OR REPLACE FUNCTION get_marketing_aggregates(start_date text, end_date text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_leads', (SELECT count(*) FROM leads WHERE created_at >= start_date::timestamp AND created_at <= end_date::timestamp),
    'total_spend', (SELECT COALESCE(sum(spend), 0) FROM ad_spend_daily WHERE date >= start_date::date AND date <= end_date::date)
  ) INTO result;
  
  RETURN result;
END;
$$;
