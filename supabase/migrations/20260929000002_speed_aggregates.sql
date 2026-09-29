CREATE OR REPLACE FUNCTION rpc_funnel_ad_spend_daily(p_from text, p_to text)
RETURNS TABLE(date text, spend numeric)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT date::text, sum(spend) as spend
  FROM ad_spend_daily
  WHERE date >= p_from::date AND date <= p_to::date
  GROUP BY date;
$$;

CREATE OR REPLACE FUNCTION rpc_funnel_cost_entries(p_from text, p_to text)
RETURNS TABLE(entry_date text, amount_inr numeric, is_organic boolean)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT entry_date::text, sum(amount_inr) as amount_inr, is_organic
  FROM marketing_cost_entries
  WHERE entry_date >= p_from::date AND entry_date <= p_to::date
  GROUP BY entry_date, is_organic;
$$;
