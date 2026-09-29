CREATE OR REPLACE FUNCTION rpc_funnel_aggregate_daily(p_from date, p_to date, p_programme text DEFAULT NULL, p_cohort_id uuid DEFAULT NULL)
RETURNS TABLE (
    date text,
    sessions bigint,
    "metaSpend" numeric,
    "nonMetaSpend" numeric,
    "organicSpend" numeric,
    "inorganicSpend" numeric,
    "totalSpend" numeric,
    leads bigint,
    "organicLeads" bigint,
    "inorganicLeads" bigint,
    "aqlOrganic" bigint,
    "aqlInorganic" bigint,
    "aqlTotal" bigint,
    "r1Booked" bigint,
    "r1BookedOrganic" bigint,
    "r1BookedInorganic" bigint,
    "r1Completed" bigint,
    notes text,
    "activityLog" text,
    "activityItems" jsonb,
    "doneActivations" jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH DateSeries AS (
        SELECT generate_series(p_from, p_to, '1 day'::interval)::date AS d
    ),
    SessionsData AS (
        SELECT first_seen_at::date AS d, COUNT(DISTINCT id) as sessions 
        FROM visitor_sessions 
        WHERE first_seen_at::date >= p_from AND first_seen_at::date <= p_to
        GROUP BY first_seen_at::date
    ),
    MetaSpend AS (
        SELECT asd.date::date AS d, COALESCE(SUM(asd.spend), 0) as metaSpend 
        FROM ad_spend_daily asd
        WHERE asd.date::date >= p_from AND asd.date::date <= p_to 
        GROUP BY asd.date::date
    ),
    NonMetaSpend AS (
        SELECT entry_date::date AS d, 
               COALESCE(SUM(CASE WHEN is_organic THEN amount_inr ELSE 0 END), 0) as organicSpend,
               COALESCE(SUM(CASE WHEN NOT is_organic THEN amount_inr ELSE 0 END), 0) as inorganicSpend,
               COALESCE(SUM(amount_inr), 0) as nonMetaSpend
        FROM marketing_cost_entries 
        WHERE entry_date::date >= p_from AND entry_date::date <= p_to
        GROUP BY entry_date::date
    ),
    LeadsData AS (
        SELECT 
            l.id,
            l.created_at::date AS d,
            -- Inorganic Logic precisely mapped from JS
            CASE WHEN (l.utm_medium ILIKE '%paid%') OR (l.source ILIKE '%meta%') OR (c.source_type = 'paid_ad') THEN true ELSE false END as is_inorganic,
            -- AQL Logic precisely mapped from meetsAqlCriteria(l)
            CASE WHEN (l.aql_at IS NOT NULL) OR ((LOWER(l.qualification_intent) IN ('good', 'maybe')) AND (LOWER(l.financial_check) = 'pass')) THEN 1 ELSE 0 END as is_aql,
            COALESCE(l.aql_at::date, (CASE WHEN (LOWER(l.qualification_intent) IN ('good', 'maybe')) AND (LOWER(l.financial_check) = 'pass') THEN l.created_at::date ELSE NULL END)) as aql_date
        FROM leads l
        LEFT JOIN lead_attribution la ON la.lead_id = l.id
        LEFT JOIN campaigns c ON c.id = la.first_touch_campaign_id
        WHERE l.created_at::date >= (p_from - INTERVAL '3 months') 
          AND (p_programme IS NULL OR l.programme = p_programme)
          AND (p_cohort_id IS NULL OR l.cohort_id = p_cohort_id)
    ),
    LeadHistory AS (
        SELECT 
            lh.lead_id,
            lh.changed_at::date as d,
            lh.to_stage,
            ld.is_inorganic,
            -- R1_BOOKED_STAGES precisely mapped
            CASE WHEN lh.to_stage IN ('r1_booked', 'r1_confirmed') THEN 1 ELSE 0 END as is_r1_booked,
            -- R1_DONE_STAGES precisely mapped
            CASE WHEN lh.to_stage IN ('r1_confirmed', 'r2_booked', 'r2_tbb', 'r3_booked', 'yet_to_offer', 'offered', 'closed_paid') THEN 1 ELSE 0 END as is_r1_done
        FROM lead_history lh
        JOIN LeadsData ld ON ld.id = lh.lead_id
        WHERE lh.changed_at::date >= p_from AND lh.changed_at::date <= p_to
    ),
    AggHistory AS (
        SELECT 
            d,
            COUNT(DISTINCT CASE WHEN is_r1_booked = 1 THEN lead_id END) as r1Booked,
            COUNT(DISTINCT CASE WHEN is_r1_booked = 1 AND is_inorganic THEN lead_id END) as r1BookedInorganic,
            COUNT(DISTINCT CASE WHEN is_r1_booked = 1 AND NOT is_inorganic THEN lead_id END) as r1BookedOrganic,
            COUNT(DISTINCT CASE WHEN is_r1_done = 1 THEN lead_id END) as r1Completed
        FROM LeadHistory
        GROUP BY d
    ),
    AggLeads AS (
        SELECT 
            d,
            COUNT(id) as leads,
            SUM(CASE WHEN is_inorganic THEN 1 ELSE 0 END) as inorganicLeads,
            SUM(CASE WHEN NOT is_inorganic THEN 1 ELSE 0 END) as organicLeads
        FROM LeadsData
        WHERE d >= p_from AND d <= p_to
        GROUP BY d
    ),
    AggAQL AS (
        SELECT 
            aql_date as d,
            SUM(1) as aqlTotal,
            SUM(CASE WHEN is_inorganic THEN 1 ELSE 0 END) as aqlInorganic,
            SUM(CASE WHEN NOT is_inorganic THEN 1 ELSE 0 END) as aqlOrganic
        FROM LeadsData
        WHERE aql_date >= p_from AND aql_date <= p_to
        GROUP BY aql_date
    ),
    NotesData AS (
        SELECT note_date::date AS d, notes, activity_log 
        FROM marketing_daily_notes 
        WHERE note_date::date >= p_from AND note_date::date <= p_to
    )
    SELECT 
        ds.d::text as date,
        COALESCE(sd.sessions, 0) as sessions, 
        COALESCE(ms.metaSpend, 0) as "metaSpend",
        COALESCE(nms.nonMetaSpend, 0) as "nonMetaSpend",
        COALESCE(nms.organicSpend, 0) as "organicSpend",
        COALESCE(nms.inorganicSpend, 0) + COALESCE(ms.metaSpend, 0) as "inorganicSpend",
        COALESCE(nms.nonMetaSpend, 0) + COALESCE(ms.metaSpend, 0) as "totalSpend",
        COALESCE(al.leads, 0) as leads,
        COALESCE(al.organicLeads, 0) as "organicLeads",
        COALESCE(al.inorganicLeads, 0) as "inorganicLeads",
        COALESCE(aq.aqlOrganic, 0) as "aqlOrganic",
        COALESCE(aq.aqlInorganic, 0) as "aqlInorganic",
        COALESCE(aq.aqlTotal, 0) as "aqlTotal",
        COALESCE(ah.r1Booked, 0) as "r1Booked",
        COALESCE(ah.r1BookedOrganic, 0) as "r1BookedOrganic",
        COALESCE(ah.r1BookedInorganic, 0) as "r1BookedInorganic",
        COALESCE(ah.r1Completed, 0) as "r1Completed",
        COALESCE(nd.notes, '') as notes,
        COALESCE(nd.activity_log, '') as "activityLog",
        '[]'::jsonb as "activityItems",
        '[]'::jsonb as "doneActivations"
    FROM DateSeries ds
    LEFT JOIN SessionsData sd ON sd.d = ds.d
    LEFT JOIN MetaSpend ms ON ms.d = ds.d
    LEFT JOIN NonMetaSpend nms ON nms.d = ds.d
    LEFT JOIN AggLeads al ON al.d = ds.d
    LEFT JOIN AggAQL aq ON aq.d = ds.d
    LEFT JOIN AggHistory ah ON ah.d = ds.d
    LEFT JOIN NotesData nd ON nd.d = ds.d
    ORDER BY ds.d;
END;
$$;
