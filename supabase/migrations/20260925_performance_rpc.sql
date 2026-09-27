CREATE OR REPLACE FUNCTION get_lead_board_metrics(p_lead_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  -- We will aggregate everything into a JSON array
  -- But first, let's just test if we can return a simple JSON
  SELECT jsonb_agg(jsonb_build_object('lead_id', id)) INTO result
  FROM unnest(p_lead_ids) as id;
  
  RETURN result;
END;
$$;