# Website forms → CRM field mapping audit

**Status:** CRM intake ready · live site form inventory needs marketing owner  
**API:** `POST /api/leads/website` · Auth: `Authorization: Bearer CRM_TRACK_API_KEY`  
**Dedup:** phone (normalized) → email → create · re-submit adds `lead_touchpoints`

## Accepted JSON fields

| Form / body field | CRM destination | Notes |
|---|---|---|
| `name` | `leads.name` | Required |
| `phone` | `leads.phone` | Required; digits-only IN normalize |
| `email` | `leads.email` | Optional |
| `source` | `leads.source` | Default `website`; may become `website:pgp` etc. |
| `programme` | `leads.programme` | Free text; used for course inference |
| `session_id` | `leads.website_session_id` + `lead_attribution` | UUID from tracking cookie |
| `course_id` / `cohort_id` | leads | Only if valid UUIDs |
| `linkedin` | `leads.linkedin` | |
| `years_experience` | `leads.years_experience` | |
| `preferred_industry` | `leads.preferred_industry` | |
| `intent_score` | `leads.intent_score` + `score_auto` | Form prior |
| `utm_source` | `leads.utm_source` | Also on `visitor_sessions` via track |
| `utm_medium` | `leads.utm_medium` | |
| `utm_campaign` | `leads.utm_campaign` | |
| `utm_content` | `leads.utm_content` | |

## Live forms to verify (fill with URLs)

| Form URL | Page | Fields posted today | Gaps found | Fixed? |
|---|---|---|---|---|
| _TBD — marketing_ | | | | |

## Gaps fixed in this integration pass

- UTMs accepted on intake and stored on lead when migration applied
- Re-submit creates touchpoint (not a second lead)
- Production requires `CRM_TRACK_API_KEY` (503 if unset)
- New lead fires stage trigger engine (`new_lead` + counsellor allocated)

## How to complete the audit

1. List every apply / brochure / LP form on hiveschool.co + LPs.
2. Submit a test lead with known UTMs from each form.
3. Confirm lead row + Marketing tab + Channel report.
4. Tick the table above; open issues for any dropped fields.
