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
- **Encrypted secrets** — LinkedIn tokens and AI API keys are encrypted at rest (AES-256-GCM) in SQLite.

---

## How it works

```mermaid
flowchart LR
  settings[(Settings: provider + schedules)]
  topics[(Topics)] --> worker[Worker master tick]
  user[User] -->|on-demand| generator[Post Generator]
  settings --> worker
  worker -->|when due| llm[Active LLM provider]
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
| Database | SQLite via [Prisma 7](https://www.prisma.io) + `better-sqlite3` adapter |
| AI | Pluggable adapters: `@google/genai` (Gemini), OpenAI-compatible `fetch` (DeepSeek) |
| Worker | `node-cron` + `tsx` — separate process sharing the Prisma client |
| Auth | LinkedIn OAuth 2.0 (OpenID Connect + Share on LinkedIn) |

---

## Prerequisites

Before running FirmBroadcast locally, you need:

1. **Node.js 20+** and npm
2. **A LinkedIn Developer app** with:
   - [Sign In with LinkedIn using OpenID Connect](https://www.linkedin.com/developers/)
   - **Share on LinkedIn** product (for `w_member_social`)
   - Redirect URL: `http://localhost:3000/api/auth/linkedin/callback` (or your `APP_URL` + `/api/auth/linkedin/callback`)
3. **An encryption key** — 32-byte secret for token/key encryption (`openssl rand -base64 32`)
4. **An AI provider API key** — Gemini and/or DeepSeek (configured in the UI after first boot; not required in `.env`)

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
| `DATABASE_URL` | SQLite path, e.g. `file:./dev.db` (relative to `prisma/`) |
| `APP_URL` | Public app URL, e.g. `http://localhost:3000` |
| `APP_ENCRYPTION_KEY` | 32-byte key for encrypting LinkedIn tokens and AI keys at rest |
| `LINKEDIN_CLIENT_ID` | LinkedIn app Client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn app Client Secret |

AI provider keys and schedules are **not** set in `.env`—use the Settings page after the app starts.

Optional tuning (see [.env.example](.env.example)):

| Variable | Default | Description |
| --- | --- | --- |
| `LINKEDIN_REDIRECT_URI` | `${APP_URL}/api/auth/linkedin/callback` | OAuth callback |
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

Open [http://localhost:3000](http://localhost:3000).

### 5. First-time setup in the UI

1. **Settings** (`/settings`) — Add a Gemini or DeepSeek API key, select a model, and mark one provider as **Active**. Optionally enable **Automatic post generation** and **Automatic publishing** with friendly schedules.
2. **Dashboard** (`/`) — Click **Connect LinkedIn** and authorize your personal profile.
3. **Topics** (`/topics`) — Add reusable prompts (optional; used by scheduled generation).
4. **Post Generator** (`/generate`) — Create your first draft manually.

### 6. Start the background worker (optional)

The worker handles scheduled generation from active topics and scheduled publishing of approved drafts. It reads schedules from the database every minute—changes in Settings apply without restarting the worker.

In a **second terminal**:

```bash
npm run worker
```

One-shot commands (useful for debugging):

```bash
npm run worker:scheduler   # run one generation tick, then exit
npm run worker:publisher   # run one publish tick, then exit
```

For local development you typically run **both** `npm run dev` and `npm run worker`.

---

## Pages

| Route | Purpose |
| --- | --- |
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
| `npm run worker` | Background worker (master tick every minute) |
| `npm run worker:scheduler` | Single generation tick |
| `npm run worker:publisher` | Single publish tick |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:generate` | Regenerate Prisma client |

---

## Project structure

```
app/
  page.tsx              # Dashboard
  generate/             # Post Generator
  topics/               # Topics CRUD UI
  settings/             # AI + schedule settings
  api/                  # Route handlers (drafts, topics, settings, OAuth, …)
  components/           # Shared UI (nav, draft-card, …)
lib/
  llm/                  # Universal generation (registry, adapters, generatePost)
  linkedin/             # OAuth, token refresh, publish
  schedule.ts           # Friendly schedule presets + due logic
  settings.ts           # AppSetting singleton helpers
  crypto.ts             # AES-256-GCM encryption
  env.ts                # Typed environment access
worker/
  index.ts              # Master cron loop
  scheduler.ts          # Generate drafts from active topics
  publisher.ts          # Publish due approved drafts
prisma/
  schema.prisma         # SQLite schema
  migrations/           # Migration history
```

---

## LinkedIn API notes

- **Personal posting** uses `w_member_social` via the self-serve Share on LinkedIn product.
- **Company pages** require the gated Community Management API (`w_organization_social`)—planned for a later phase ([PLAN.md](PLAN.md) Phase 6).
- Posts are created with `POST https://api.linkedin.com/rest/posts` and version headers `LinkedIn-Version` + `X-Restli-Protocol-Version: 2.0.0`.
- LinkedIn rate limits are roughly **100 API calls per member per day**—keep publishing cadence modest.

---

## Roadmap

| Phase | Status | Summary |
| --- | --- | --- |
| 0 | Manual | LinkedIn app + credentials |
| 1 | Done | Scaffolding, Prisma, SQLite |
| 2 | Done | LinkedIn OAuth (personal) |
| 3 | Done | AI generation + Post Generator |
| 4 | Done | Approval dashboard |
| 5 | Done | Scheduler + publisher worker |
| Alpha | Done | Multi-model settings, friendly schedules, manual publish, paginated dashboard |
| 6 | Planned | Company page posting |
| 7 | Planned | Hardening + deploy |

Full details: [PLAN.md](PLAN.md).

---

## Security

- Never commit `.env` or real API keys.
- `APP_ENCRYPTION_KEY` protects LinkedIn OAuth tokens and AI provider keys in the database.
- The Settings API returns `keySet: true/false` only—never the decrypted key.
- This alpha targets **single-user / trusted local or small-team** use; there is no multi-tenant auth layer yet.

---

## License

Private project (`"private": true` in `package.json`). All rights reserved unless otherwise specified by the repository owner.
