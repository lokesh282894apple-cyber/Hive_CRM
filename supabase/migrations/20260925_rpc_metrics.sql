-- Ultra-fast RPC for Lead Card Metrics
-- Runs loops directly in Postgres to eliminate 15+ network requests from Vercel to Supabase.

CREATE OR REPLACE FUNCTION get_lead_card_metrics(p_lead_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  l_id UUID;
  result JSONB := '[]'::JSONB;
  lead_metrics JSONB;
  
  v_stage_entered_at TIMESTAMPTZ;
  
  v_total_calls INT;
  v_unique_days INT;
  v_last_call_at TIMESTAMPTZ;
  v_last_call_since_stage TIMESTAMPTZ;
  v_calls_since_stage INT;
  v_recording_url TEXT;
  
  v_interview_at TIMESTAMPTZ;
  v_read_ai_url TEXT;
  
  v_grade_avg NUMERIC;
  v_grade_count INT;
  
  v_approvals JSONB;
  
  v_stage TEXT;
  v_created_at TIMESTAMPTZ;
BEGIN
  FOR l_id IN SELECT unnest(p_lead_ids)
  LOOP
    -- Get base lead info needed for logic
    SELECT stage, created_at INTO v_stage, v_created_at
    FROM leads WHERE id = l_id;
    
    -- Stage entered at
    SELECT changed_at INTO v_stage_entered_at
    FROM stage_history
    WHERE lead_id = l_id AND to_stage = v_stage
    ORDER BY changed_at DESC LIMIT 1;
    
    IF v_stage_entered_at IS NULL THEN
      v_stage_entered_at := v_created_at;
    END IF;

    -- Call metrics
    SELECT 
      count(*),
      count(DISTINCT date(logged_at AT TIME ZONE 'Asia/Kolkata')),
      max(logged_at),
      max(CASE WHEN logged_at >= v_stage_entered_at THEN logged_at ELSE NULL END),
      count(CASE WHEN logged_at >= v_stage_entered_at THEN 1 ELSE NULL END)
    INTO 
      v_total_calls, v_unique_days, v_last_call_at, v_last_call_since_stage, v_calls_since_stage
    FROM call_logs
    WHERE lead_id = l_id;
    
    SELECT recording_url INTO v_recording_url
    FROM call_logs
    WHERE lead_id = l_id AND recording_url IS NOT NULL
    ORDER BY logged_at DESC LIMIT 1;

    -- Bookings
    SELECT COALESCE(scheduled_at, created_at), read_ai_report_url
    INTO v_interview_at, v_read_ai_url
    FROM interview_bookings
    WHERE lead_id = l_id
    ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 1;
    
    -- Grades
    SELECT round(avg(score)::numeric, 2), count(*)
    INTO v_grade_avg, v_grade_count
    FROM lead_panelist_grades
    WHERE lead_id = l_id;
    
    -- Approvals
    SELECT jsonb_agg(
      jsonb_build_object(
        'slot', a.slot,
        'label', a.label,
        'status', a.status,
        'approvedByName', u.name,
        'approvedAt', a.approved_at
      )
    ) INTO v_approvals
    FROM lead_approvals a
    LEFT JOIN users u ON a.approved_by = u.id
    WHERE a.lead_id = l_id;

    -- Build JSON
    lead_metrics := jsonb_build_object(
      'lead_id', l_id,
      'totalCalls', COALESCE(v_total_calls, 0),
      'uniqueDays', COALESCE(v_unique_days, 0),
      'lastCallAt', v_last_call_at,
      'lastCallSinceStageAt', v_last_call_since_stage,
      'interviewAt', v_interview_at,
      'stageEnteredAt', v_stage_entered_at,
      'callsSinceStage', COALESCE(v_calls_since_stage, 0),
      'gradeAvg', v_grade_avg,
      'gradeCount', COALESCE(v_grade_count, 0),
      'recordingUrl', COALESCE(v_read_ai_url, v_recording_url),
      'approvals', COALESCE(v_approvals, '[]'::JSONB)
    );
    
    result := result || jsonb_build_array(lead_metrics);
  END LOOP;
  
  RETURN result;
END;
$$;
