# FirmBroadcast

**FirmBroadcast** is a LinkedIn autoposter that drafts posts with AI, queues them for human review, and publishes approved content to your personal LinkedIn profile on a schedule—or on demand.

Posts enter the same approval pipeline whether you generate them manually or the background worker creates them from saved topics. You stay in control: nothing goes live until you approve it (unless you explicitly hit **Publish now**).

> **Status:** Alpha — Phases 0–5 of the [implementation plan](PLAN.md) are complete, plus alpha polish (multi-model settings, friendly schedules, status-aware dashboard).

---

## Features

- **AI post generation** — Draft LinkedIn posts from any topic or saved prompt. Supports **Google Gemini** and **DeepSeek** (extensible via a provider registry).
- **Post Generator** — Preview, edit, and save drafts on demand (`/generate`).
- **Topics** — Reusable prompts the scheduler turns into drafts when generation is enabled (`/topics`).
- **Approval dashboard** — Review pending drafts, edit copy, approve or reject, and paginate large queues (`/`).
- **Manual publish** — Publish approved drafts immediately with **Publish now**, or let the worker post on schedule.
- **Scheduled generation & publishing** — Separate, user-friendly schedules (hourly, every N hours, daily, weekly) configured in Settings—no raw cron.
- **LinkedIn OAuth** — Connect a personal profile (`w_member_social`) and publish via the LinkedIn Posts API.
- **Encrypted secrets** — LinkedIn tokens and AI API keys are encrypted at rest (AES-256-GCM) in Supabase Postgres.
- **Email/password login** — Supabase Auth protects the app; create users in the Supabase dashboard.

---

## How it works

```mermaid
flowchart LR
  settings[(Settings: provider + schedules)]
  topics[(Topics)] --> cron[Vercel cron / local worker]
  user[User] -->|on-demand| generator[Post Generator]
  settings --> cron
  cron -->|when due| llm[Active LLM provider]
  generator --> llm
  llm --> pending[(Drafts: PENDING)]
  pending --> dashboard[Approval dashboard]
  dashboard -->|approve| approved[(Drafts: APPROVED)]
  approved -->|Publish now or schedule| publisher[Publisher]
  publisher --> linkedin[LinkedIn /rest/posts]
  linkedin --> published[(Drafts: PUBLISHED)]
```

1. **Configure** — Open **Settings** (`/settings`): add an AI provider API key, pick the active model, connect LinkedIn on the dashboard, and enable generation/publishing schedules if you want automation.
2. **Generate** — Create drafts manually from the Post Generator, or let the worker generate one draft per active topic when the generation schedule is due.
3. **Review** — On the dashboard, edit copy, approve, reject, or regenerate pending drafts.
4. **Publish** — Click **Publish now** on an approved draft, or enable the publishing schedule so the worker posts due approved drafts automatically.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| App | [Next.js 16](https://nextjs.org) (App Router) + TypeScript + React 19 |
| Styling | Tailwind CSS 4 |
| Database | [Supabase](https://supabase.com) Postgres via [Prisma 7](https://www.prisma.io) + `@prisma/adapter-pg` |
| AI | Pluggable adapters: `@google/genai` (Gemini), OpenAI-compatible `fetch` (DeepSeek) |
| Scheduling | [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) (`/api/cron/tick` every minute); local dev worker optional |
| Auth | Supabase Auth (email/password) + LinkedIn OAuth 2.0 for posting |

---

## Prerequisites

Before running FirmBroadcast locally, you need:

1. **Node.js 20+** and npm
2. **A Supabase project** with:
   - Postgres database (copy the connection string from Project Settings → Database)
   - Auth enabled with at least one user (Authentication → Users → Add user)
   - Project URL and anon key (Project Settings → API)
3. **A LinkedIn Developer app** with:
   - [Sign In with LinkedIn using OpenID Connect](https://www.linkedin.com/developers/)
   - **Share on LinkedIn** product (for `w_member_social`)
   - Redirect URL: `{APP_URL}/api/auth/linkedin/callback` (e.g. `http://localhost:3000/api/auth/linkedin/callback` locally)
4. **An encryption key** — 32-byte secret for token/key encryption (`openssl rand -base64 32`)
5. **An AI provider API key** — Gemini and/or DeepSeek (configured in the UI after first boot; not required in `.env`)

See [PLAN.md](PLAN.md) Phase 0 for LinkedIn portal setup details.

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

This runs `prisma generate` automatically via `postinstall`.

### 2. Configure environment

Copy the example env file and fill in the required values:

```bash
cp .env.example .env
```

Minimum required variables:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres connection string (use the **Transaction pooler** URL on Vercel) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (`sb_publishable_…`; legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also accepted) |
| `APP_URL` | Public app URL, e.g. `http://localhost:3000` |
| `APP_ENCRYPTION_KEY` | 32-byte key for encrypting LinkedIn tokens and AI keys at rest |
| `LINKEDIN_CLIENT_ID` | LinkedIn app Client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn app Client Secret |
| `CRON_SECRET` | Random secret for `/api/cron/tick` (required in production on Vercel) |

AI provider keys and schedules are **not** set in `.env`—use the Settings page after the app starts.

Optional tuning (see [.env.example](.env.example)):

| Variable | Default | Description |
| --- | --- | --- |
| `LINKEDIN_API_VERSION` | `202605` | `LinkedIn-Version` header (`YYYYMM`) |
| `MAX_PUBLISH_ATTEMPTS` | `5` | Retries before a draft is marked `FAILED` |
| `PUBLISH_BATCH_SIZE` | `5` | Max drafts published per worker tick |

### 3. Run database migrations

```bash
npm run db:migrate
```

### 4. Start the web app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the Supabase user you created.

### 5. First-time setup in the UI

1. **Settings** (`/settings`) — Add a Gemini or DeepSeek API key, select a model, and mark one provider as **Active**. Optionally enable **Automatic post generation** and **Automatic publishing** with friendly schedules.
2. **Dashboard** (`/`) — Click **Connect LinkedIn** and authorize your personal profile.
3. **Topics** (`/topics`) — Add reusable prompts (optional; used by scheduled generation).
4. **Post Generator** (`/generate`) — Create your first draft manually.

### 6. Local scheduling (optional)

In production on **Vercel**, scheduled generation and publishing run automatically via a cron job (`vercel.json` → `/api/cron/tick` every minute). Set `CRON_SECRET` in your Vercel project env vars; Vercel sends it as `Authorization: Bearer …`.

For **local development**, run the dev worker in a second terminal (same logic as the cron tick):

```bash
npm run worker
```

One-shot commands (useful for debugging):

```bash
npm run worker:scheduler   # run one generation tick, then exit
npm run worker:publisher   # run one publish tick, then exit
```

---

## Deploying to Vercel + Supabase

1. **Supabase** — Create a project and add at least one Auth user.
2. **Vercel** — Import the repo and set environment variables from `.env.example`.
3. **Database URLs** — Set both on Vercel:
   - `DATABASE_URL` — Supabase **Transaction pooler** (port `6543`, `?pgbouncer=true`) for runtime queries.
   - `DIRECT_URL` — Supabase **Session pooler** or direct URL (port `5432`) for Prisma migrations during build.
4. **Migrations** — Each Vercel deploy runs `prisma migrate deploy` automatically (`vercel-build`). To apply migrations manually first:

   ```bash
   DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres" npm run db:deploy
   ```

5. **Cron** — `vercel.json` is included; set `CRON_SECRET` in Vercel. Cron jobs only run on **production** deployments.
6. **Auth redirect** — In Supabase → Authentication → URL Configuration, add your Vercel domain to **Site URL** and **Redirect URLs** (include `/auth/callback`).
7. **LinkedIn** — Add your production callback URL to the LinkedIn app redirect allowlist.

---

## Pages

| Route | Purpose |
| --- | --- |
| `/login` | Email/password sign-in (Supabase Auth) |
| `/` | Dashboard — connected accounts, draft filters (Pending / Approved / Rejected / Published), approval actions, load-more pagination |
| `/generate` | Post Generator — ad-hoc topic, tone/length, preview, save to queue |
| `/topics` | Manage reusable prompts; active topics are generated on the global schedule |
| `/settings` | AI provider keys & models, active provider, generation & publishing schedules |

---

## Draft lifecycle

| Status | Meaning | Typical actions |
| --- | --- | --- |
| `PENDING` | Awaiting review | Approve, Reject, Regenerate, Save edits, Delete |
| `APPROVED` | Ready to publish | **Publish now**, Revert to pending, Save edits, Delete |
| `REJECTED` | Declined | Restore to pending, Delete |
| `PUBLISHED` | Live on LinkedIn | View on LinkedIn, Delete |
| `FAILED` | Publish error (retries exhausted or manual failure) | Retry publish, Revert to pending, Delete |

Approved drafts with a future `scheduledAt` are published when that time is reached (worker). Null `scheduledAt` means publish as soon as the publishing schedule runs (or use **Publish now**).

---

## AI providers

Providers are registered in code ([`lib/llm/registry.ts`](lib/llm/registry.ts)). The Settings UI exposes each registered provider; credentials and the chosen model live in the `LlmProvider` table (encrypted).

| Provider | Models (defaults in bold) |
| --- | --- |
| Google Gemini | **gemini-2.5-flash-lite**, gemini-2.5-flash, gemini-2.5-pro |
| DeepSeek | **deepseek-chat**, deepseek-reasoner |

To add a new provider later:

1. Implement `LLMAdapter` in `lib/llm/<provider>.ts`
2. Register it in `lib/llm/registry.ts`
3. No schema or Settings UI changes required—the new provider appears automatically

---

## Schedules

Generation and publishing use **independent** schedules, configured under **Settings**:

| Preset | Behavior |
| --- | --- |
| Every hour | Runs at a chosen minute past each hour |
| Every N hours | Runs on a fixed interval from the last run |
| Daily at a time | Runs once per day at hour:minute (server local time) |
| Weekly on a day | Runs once per week on the chosen weekday and time |

When generation is due, the worker creates **one PENDING draft per ACTIVE topic**. When publishing is due, it publishes up to `PUBLISH_BATCH_SIZE` approved drafts whose `scheduledAt` is null or in the past.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run worker` | Local dev scheduler (master tick every minute) |
| `npm run worker:scheduler` | Single generation tick |
| `npm run worker:publisher` | Single publish tick |
| `npm run db:migrate` | Create/apply Prisma migrations (local dev) |
| `npm run db:deploy` | Apply pending migrations to production DB |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:generate` | Regenerate Prisma client |

---

## Project structure

```
app/
  login/                # Supabase email/password sign-in
  page.tsx              # Dashboard
  generate/             # Post Generator
  topics/               # Topics CRUD UI
  settings/             # AI + schedule settings
  api/                  # Route handlers (drafts, topics, settings, OAuth, cron, …)
  auth/callback/        # Supabase auth callback
  components/           # Shared UI (nav, draft-card, …)
lib/
  supabase/             # Browser + server Supabase clients, session middleware
  cron/                 # Vercel cron tick + auth verification
  llm/                  # Universal generation (registry, adapters, generatePost)
  linkedin/             # OAuth, token refresh, publish
  schedule.ts           # Friendly schedule presets + due logic
  settings.ts           # AppSetting singleton helpers
  crypto.ts             # AES-256-GCM encryption
  env.ts                # Typed environment access
worker/
  index.ts              # Local dev scheduler loop
  scheduler.ts          # Generate drafts from active topics
  publisher.ts          # Publish due approved drafts
prisma/
  schema.prisma         # Postgres schema
  migrations/           # Migration history
vercel.json             # Vercel cron configuration
middleware.ts           # Supabase session refresh + route protection
```

---

## LinkedIn API notes

- **Personal posting** uses `w_member_social` via the self-serve Share on LinkedIn product.
- **Company pages** require the gated Community Management API (`w_organization_social`)—planned for a later phase ([PLAN.md](PLAN.md) Phase 6).
- Posts are created with `POST https://api.linkedin.com/rest/posts` and version headers `LinkedIn-Version` + `X-Restli-Protocol-Version: 2.0.0`.
- LinkedIn rate limits are roughly **100 API calls per member per day**—keep publishing cadence modest.

---

## LinkedIn topics — FirmPulse ([pulse.firmsoft.ai](https://pulse.firmsoft.ai/))

Copy any row into **Topics** (`/topics`). The **Topic** column is the prompt the scheduler sends to the LLM. **Tone** and **Length** are optional hints; leave blank to use your global defaults.

### Positioning & thought leadership

| Topic | Tone | Length |
| --- | --- | --- |
| Why IoT operations teams are still stitching together 4–6 disconnected tools — and what an "operations layer" looks like instead of another dashboard | bold | long |
| 43% of unplanned downtime is first reported by customers, not the ops team. Share a story about reactive vs. predictive operations and how early detection changes mean time to respond | storytelling | medium |
| The difference between a raw IoT platform, a point tool, and a full operations stack — when to use each and why most teams outgrow "just collect telemetry" | professional | long |
| "We found out the sensor failed because the fridge alarm went off — three hours later." Write about the gap between threshold alarms and true predictive maintenance | conversational | medium |
| One platform vs. five tools: Grafana for charts, Jira for tickets, email for coordination, spreadsheets for calibration — why context fragmentation kills response time | bold | medium |

### Predictive maintenance & alarms

| Topic | Tone | Length |
| --- | --- | --- |
| How nightly 0–100 device health scores, ranked work queues, and predicted failure ETAs (up to 90 days) help ops teams fix the right asset before a 2am emergency | professional | medium |
| Three detection layers in one acknowledge workflow: compound threshold rules, statistical anomaly detection, and AI explanations grounded in live sensor readings | professional | long |
| From anomaly to work order in one click — how auto-generated maintenance tasks with SLA deadlines close the loop between monitoring and action | conversational | short |
| IEC 62682 incident correlation: when multiple alarms share a root cause, one incident view beats five separate pager notifications | professional | medium |
| AI alarm intelligence that explains *why* an alarm fired and suggests next steps — not generic chatbot advice, but context from your actual telemetry | bold | medium |

### Compliance & reporting

| Topic | Tone | Length |
| --- | --- | --- |
| The audit-week scramble: pulling logs from five systems into a spreadsheet vs. 45 built-in report types exportable in one click, any time | storytelling | medium |
| Pharma & life sciences: 21 CFR Part 11, ISO/IEC 17025, and GxP audit trails — what "audit-ready" actually means for IoT telemetry and calibration | professional | long |
| Food & beverage cold chain: HACCP monitoring, ISO 22000, and alerts that fire before product is compromised — not after a customer complaint | professional | medium |
| Schedule compliance reports to run automatically so auditors get what they need before they ask — ISO 27001, SOC 2, FDA, GHG Protocol, and industry-specific packs | professional | medium |
| Calibration traceability with reference standard, accredited lab, accreditation ID, and certificate URL stored per log — built for ISO/IEC 17025 reviews | professional | short |

### Industry spotlights

| Topic | Tone | Length |
| --- | --- | --- |
| FirmPulse for pharma & life sciences: GxP audit trails, calibration traceability, and cleanroom ACH reporting in one connected platform | professional | medium |
| Data center operations: PUE monitoring, uptime reporting, and ISO 27001-aligned audit packs — beyond "pretty Grafana charts" | professional | medium |
| Energy & utilities: NERC CIP awareness, kWh tracking, CO₂ reporting, and slab-by-slab tariff modeling for real energy cost visibility | professional | medium |
| Commercial buildings & ISA-95 hierarchy: work orders, SLAs, NAMUR NE107 device health states, and building → room → device rollups | professional | medium |
| Manufacturing ops at scale: 200+ devices, predictive maintenance queue preventing unplanned shutdowns, and one place to go when something goes wrong | storytelling | medium |

### Technical differentiators

| Topic | Tone | Length |
| --- | --- | --- |
| Adaptive transport: LAN WebSocket (4–8ms), BLE fallback, MQTT cloud relay — devices stay connected without firmware changes when the network shifts | bold | medium |
| Native OPC-UA bridge with no sidecar: poll node IDs directly into anomaly detection, alarms, health scoring, and compliance reports | professional | short |
| OTA firmware updates with canary, rolling, or all-at-once deploys plus auto-rollback when failure thresholds breach — full per-device audit trail | professional | medium |
| IEC 62443 command approval workflow: high-stakes device commands require multi-approver sign-off before dispatch | professional | short |
| Schema-isolated multi-tenancy on AWS IoT Core — MQTT, OPC-UA, LoRaWAN, BLE, REST, and WebSocket in one platform | professional | medium |
| Smart Insights: ask questions about sensor data in plain English with your own LLM key (OpenAI, Anthropic, or compatible) — operational AI without vendor lock-in | conversational | medium |

### Energy & sustainability

| Topic | Tone | Length |
| --- | --- | --- |
| Real energy cost computed per reading, not estimated from daily averages — unlimited tariff slabs from flat-rate to progressive utility plans | professional | medium |
| See which floor or appliance drives the bill before it arrives: consumption rolled up building → room → device with CO₂ equivalent alongside cost | conversational | medium |
| Sustainability reporting built in: top energy consumers surfaced automatically, default 0.233 kg/kWh CO₂e, overridable per org for renewable-backed grids | professional | short |

### Mobile & integrations

| Topic | Tone | Length |
| --- | --- | --- |
| FirmPulse mobile app: push alarms, one-tap acknowledge from the lock screen, live parameter state, and compliance report export from the field | conversational | short |
| Webhooks to Slack, Teams, Jira, PagerDuty, email, or any HTTP endpoint — HMAC-signed with automatic retry and exponential backoff | professional | short |
| When an alarm fires, your team shouldn't hunt across five tools — monitoring, work orders, escalation, and compliance in one connected workflow | bold | medium |

### Product & growth CTAs

| Topic | Tone | Length |
| --- | --- | --- |
| Introducing FirmPulse — the IoT operations platform for industrial and commercial teams. Not a box of tools to wire together. The operations layer, assembled. Link: pulse.firmsoft.ai | inspirational | short |
| Early access waitlist for FirmPulse is open — limited spots for teams tired of assembling Grafana + Jira + email + spreadsheets. Book a demo or join the waitlist at pulse.firmsoft.ai | conversational | short |
| 2.3× faster mean response time and 90% SLA adherence — what changes when alerts trigger automated action pipelines instead of manual triage | bold | medium |
| Book a 30-minute FirmPulse walkthrough tailored to your industry and device stack — no commitment, see monitoring, predictive maintenance, and compliance in one demo | professional | short |

### Suggested posting cadence

- **Week 1–2:** Positioning + one industry spotlight + one feature deep-dive.
- **Week 3–4:** Compliance angle + technical differentiator + mobile/integrations.
- **Ongoing:** Rotate pain-point stories, customer-outcome narratives, and soft CTAs (waitlist / demo) — aim for 2–3 posts per week with varied tone so the feed doesn't feel repetitive.

Pause or rotate topics in `/topics` after a draft publishes so the scheduler doesn't repeat the same angle back-to-back.

---

## Roadmap

| Phase | Status | Summary |
| --- | --- | --- |
| 0 | Manual | LinkedIn app + credentials |
| 1 | Done | Scaffolding, Prisma, Supabase Postgres |
| 2 | Done | LinkedIn OAuth (personal) |
| 3 | Done | AI generation + Post Generator |
| 4 | Done | Approval dashboard |
| 5 | Done | Scheduler + publisher (Vercel cron + local worker) |
| Alpha | Done | Multi-model settings, friendly schedules, manual publish, paginated dashboard, Supabase Auth |
| 6 | Planned | Company page posting |
| 7 | Planned | Hardening |

Full details: [PLAN.md](PLAN.md).

---

## Security

- Never commit `.env` or real API keys.
- `APP_ENCRYPTION_KEY` protects LinkedIn OAuth tokens and AI provider keys in the database.
- The Settings API returns `keySet: true/false` only—never the decrypted key.
- Supabase Auth protects all routes except `/login` and `/auth/callback`. Cron endpoints use `CRON_SECRET` instead of session auth.
- Create app users in the Supabase dashboard (Authentication → Users); self-service signup is not enabled in the UI yet.

---

## License

Private project (`"private": true` in `package.json`). All rights reserved unless otherwise specified by the repository owner.
