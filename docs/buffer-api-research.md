# Buffer API research (social scheduling)

**Date:** 2026-09-17  
**Goal:** Decide whether Hive CRM should build scheduling on Buffer’s public API/MCP, or keep Buffer (or another ~₹3–4k/mo tool) as the scheduling surface.

## Verdict

**Keep Buffer (or equivalent SaaS) for publishing/scheduling. Do not rebuild a multi-network scheduler inside Hive.**

Buffer already exposes a public GraphQL API and an official remote MCP server. That makes *integrations* (draft → queue from CRM or an AI agent) feasible. Replacing Buffer itself would mean owning Meta/LinkedIn/X/TikTok/etc. auth, rate limits, media upload, and policy changes — far more cost than ₹3–4k/mo for a small marketing team.

---

## Public API?

**Yes.** Buffer ships a GraphQL API used for account/org/channel data, ideas, and post create/update/delete/schedule.

| Item | Detail |
|------|--------|
| Endpoint | `POST https://api.buffer.com` |
| Style | GraphQL (legacy REST is migrated away) |
| Docs | [developers.buffer.com](https://developers.buffer.com/), marketing overview [buffer.com/api](https://buffer.com/api) |
| Plan access | API available on Free, Essentials, and Team (limits scale with plan) |

### Auth model

1. **Personal API key** — Settings → API; send `Authorization: Bearer <key>`. Acts as the Buffer account (all orgs/channels on that account). Best for internal scripts and Hive server-side jobs.
2. **OAuth 2.0 Authorization Code + PKCE** — multi-user apps; scopes include `posts:read`, `posts:write`, `ideas:read`, `ideas:write`, `account:read`, `account:write`, `offline_access`.

### Key operations (GraphQL)

Not REST “REST endpoints”; these are the primary queries/mutations for scheduling:

| Operation | Kind | Purpose |
|-----------|------|---------|
| `account` | Query | Authenticated account + nested `organizations` |
| Organization → channels | Query | Connected social channels, schedules, limits |
| Posts / queue (via org/channel fields) | Query | Retrieve scheduled/draft/queued posts |
| `ideas` | Query | Idea board list |
| `createPost` | Mutation | Draft, queue (`addToQueue`), share now/next, or `customScheduled` + `dueAt` |
| `deletePost` | Mutation | Remove a post |
| Update / move-in-queue mutations | Mutation | Edit text/media/timing; reorder queue |

`createPost` supports `schedulingType` (`automatic` | `notification`), `mode` (`addToQueue` | `shareNow` | `shareNext` | `customScheduled`), optional assets, tags, and draft save.

### Rate limits (per API key / app client)

| Window | Free | Essentials | Team |
|--------|------|------------|------|
| 15 min | 100 | 100 | 100 |
| 24 h | 100* / 250 | 250 | 500 |
| 30 day | 3,000 | 7,500 | 15,000 |

\*Confirm Free daily cap in live docs if integrating; Essentials/Team figures above match Buffer’s developer portal (2025–2026).

Keys/clients: Free 1 · Essentials 3 · Team 5.

---

## MCP?

**Yes — official remote MCP.**

| Item | Detail |
|------|--------|
| URL | `https://mcp.buffer.com/mcp` |
| Docs | [buffer.com/mcp](https://buffer.com/mcp), [developers.buffer.com MCP guide](https://developers.buffer.com/guides/integrations/mcp.html) |
| Clients | Claude, ChatGPT, Cursor, Raycast, Perplexity, Zapier/n8n, others |
| Auth | OAuth in supported clients, or Bearer API key in MCP headers |

MCP tools cover listing channels, drafting/scheduling posts, queue/drafts, ideas, and analytics; generic tools can fall through to the GraphQL API. Posts typically land in Buffer’s queue/drafts for human review before publish.

**Implication for Hive:** marketing can schedule from Cursor/Claude *without* a custom CRM integration. A CRM→Buffer bridge is optional, not required for day-to-day AI-assisted posting.

---

## Feasibility vs ~₹3–4k/mo tool

Approximate Buffer SaaS cost (list, USD → INR ~₹85):

- **Essentials:** from **$6/channel/mo** (~₹500/channel) for 1–10 channels  
- **Team:** from **$12/channel/mo** (~₹1,000/channel)

A lean setup (e.g. 3–6 channels on Essentials) often lands in or under the **₹3–4k/mo** band; Team + more channels can exceed it. Buffer’s value is not “JSON API access” — it is **maintained network connectors, calendar/queue UX, analytics, and compliance**.

| Approach | Est. effort | Ongoing cost | Risk |
|----------|-------------|--------------|------|
| Keep Buffer (+ optional API/MCP) | Days for thin CRM “push to Buffer” | Buffer plan (~₹3–4k or less for few channels) | Low |
| Build Hive scheduler on Buffer API only | 1–3 weeks UI + sync | Buffer plan still required (API schedules *through* Buffer) | Medium (UI ownership, still pay Buffer) |
| Replace Buffer with custom multi-network posting | Months | Meta/LinkedIn/etc. app review, eng time ≫ ₹4k/mo | High |

Building *on* the API does **not** eliminate Buffer spend; it uses Buffer as the publisher. Fully replacing Buffer means integrating each network yourself — not justified at this spend level.

---

## Recommendation

1. **Keep Buffer** (or the current ~₹3–4k tool if it already covers the same channels) as the system of record for queues and publishing.
2. Prefer **MCP** for ad-hoc AI drafting/scheduling; no Hive code required.
3. Only add a **thin Hive server integration** (API key + `createPost`) if counselors/marketers need “schedule this from CRM” without leaving Hive — treat as a backlog item, not a cost-saving rebuild.
4. **Do not** invest in a first-party multi-network scheduler to “save” ₹3–4k/mo.

**Build vs keep:** **Keep Buffer**; optional light API/MCP glue later. Do not build a replacement.
