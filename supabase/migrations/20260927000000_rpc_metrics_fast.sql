CREATE OR REPLACE FUNCTION get_lead_card_metrics(p_lead_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH target_leads AS (
    SELECT id, stage, created_at
    FROM leads
    WHERE id = ANY(p_lead_ids)
  ),
  entered_at AS (
    SELECT DISTINCT ON (sh.lead_id) sh.lead_id, COALESCE(sh.changed_at, tl.created_at) AS stage_entered_at
    FROM target_leads tl
    LEFT JOIN stage_history sh ON sh.lead_id = tl.id AND sh.to_stage = tl.stage
    ORDER BY sh.lead_id, sh.changed_at DESC
  ),
  call_metrics AS (
    SELECT
      cl.lead_id,
      COUNT(*) AS total_calls,
      COUNT(DISTINCT DATE(cl.logged_at AT TIME ZONE 'Asia/Kolkata')) AS unique_days,
      MAX(cl.logged_at) AS last_call_at,
      MAX(CASE WHEN cl.logged_at >= ea.stage_entered_at THEN cl.logged_at ELSE NULL END) AS last_call_since_stage_at,
      COUNT(CASE WHEN cl.logged_at >= ea.stage_entered_at THEN 1 ELSE NULL END) AS calls_since_stage,
      (SELECT recording_url FROM call_logs WHERE lead_id = cl.lead_id AND recording_url IS NOT NULL ORDER BY logged_at DESC LIMIT 1) AS recording_url
    FROM call_logs cl
    JOIN entered_at ea ON ea.lead_id = cl.lead_id
    WHERE cl.lead_id = ANY(p_lead_ids)
    GROUP BY cl.lead_id, ea.stage_entered_at
  ),
  booking_metrics AS (
    SELECT DISTINCT ON (ib.lead_id) ib.lead_id, COALESCE(ib.scheduled_at, ib.created_at) AS interview_at, ib.read_ai_report_url
    FROM interview_bookings ib
    WHERE ib.lead_id = ANY(p_lead_ids)
    ORDER BY ib.lead_id, COALESCE(ib.scheduled_at, ib.created_at) DESC
  ),
  grade_metrics AS (
    SELECT lead_id, ROUND(AVG(score)::NUMERIC, 2) AS grade_avg, COUNT(*) AS grade_count
    FROM lead_panelist_grades
    WHERE lead_id = ANY(p_lead_ids)
    GROUP BY lead_id
  ),
  approval_metrics AS (
    SELECT a.lead_id, jsonb_agg(jsonb_build_object(
      'slot', a.slot,
      'label', a.label,
      'status', a.status,
      'approvedByName', u.name,
      'approvedAt', a.approved_at
    )) AS approvals
    FROM lead_approvals a
    LEFT JOIN users u ON a.approved_by = u.id
    WHERE a.lead_id = ANY(p_lead_ids)
    GROUP BY a.lead_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'lead_id', tl.id,
    'totalCalls', COALESCE(cm.total_calls, 0),
    'uniqueDays', COALESCE(cm.unique_days, 0),
    'lastCallAt', cm.last_call_at,
    'lastCallSinceStageAt', cm.last_call_since_stage_at,
    'interviewAt', bm.interview_at,
    'stageEnteredAt', COALESCE(ea.stage_entered_at, tl.created_at),
    'callsSinceStage', COALESCE(cm.calls_since_stage, 0),
    'gradeAvg', gm.grade_avg,
    'gradeCount', COALESCE(gm.grade_count, 0),
    'recordingUrl', COALESCE(bm.read_ai_report_url, cm.recording_url),
    'approvals', COALESCE(am.approvals, '[]'::JSONB)
  )), '[]'::JSONB)
  INTO result
  FROM target_leads tl
  LEFT JOIN entered_at ea ON ea.lead_id = tl.id
  LEFT JOIN call_metrics cm ON cm.lead_id = tl.id
  LEFT JOIN booking_metrics bm ON bm.lead_id = tl.id
  LEFT JOIN grade_metrics gm ON gm.lead_id = tl.id
  LEFT JOIN approval_metrics am ON am.lead_id = tl.id;

  RETURN result;
END;
$$;
