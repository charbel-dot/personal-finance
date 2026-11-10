# Money — personal finance tracker

A private, single-user finance tracker: income (with sources), expenses (with categories), recurring
expenses that log themselves, a dashboard with charts, and rule-based budget tips computed from your
own data. Mobile-first and installable as a PWA. Logging a transaction takes three steps: tap **+**,
type the amount, then press Enter. The category you used last is already selected.

Runs entirely on the Cloudflare free tier: **Pages** for the app, a **Pages Function** for the `/api`
on the same origin, a private **R2** bucket for storage, and a small **cron Worker** for recurring
entries.

```
Browser ──► Cloudflare Pages ── static SPA (dist/)
                 │
                 └─ /api/*  Pages Function (functions/api/[[route]].ts → server/app.ts, Hono)
                              │  signed HttpOnly session cookie, rate-limited login
                              ▼
                         R2 bucket (private, binding only)
                              ▲
             cron Worker (cron/) ─ hourly: generates due recurring expenses
```

## Features

- **Income and expenses**: amount, category or source, date (defaults to today), optional note. You can
  edit categories and sources, and each one is tagged _Need_, _Want_ or _Savings_ for the 50/30/20 analysis.
- **Recurring expenses**: weekly, monthly or yearly, with pause, edit and delete. Entries are generated on
  each due date by the cron Worker and again whenever the app loads, so none are missed. They are
  idempotent (deterministic ids), so there are never duplicates. Month-end dates are clamped
  (the 31st falls on the 28th, 30th or 31st), and resuming a paused expense does not back-fill the
  paused period.
- **Dashboard**: current balance (all-time, plus an optional opening balance) and income, expenses and net
  for this month, last month or a custom range. It has donut charts for expenses by category, income by
  source and income vs. expenses/savings, a 50/30/20 check with a suggested savings target, recent
  transactions and upcoming recurring expenses.
- **Budget tips** (no AI, all rules in `shared/budget.ts`): overspending, needs above 50%, wants above
  30%, the savings gap against a target suggested from your income, categories with a
  disproportionate share, period-over-period jumps (+25% and a meaningful amount), and recurring
  costs as a share of income. The top 3 tips are shown and refresh as your data changes.
- **History**: search (notes, category, amount), filters for type, category and date range, grouped by
  day, tap a row to edit or delete.
- **Savings**: its own page for money you put aside, logged by the income source it came from. Each
  source has a one-tap add button and a share of the total; you can also log withdrawals (never more
  than you have saved). Shows the all-time total, this month's net savings and progress towards the
  monthly target from your budget rule. Savings are a separate ledger and don't change the balance.
- **Categories**: its own page with expense categories grouped by Needs / Wants / Savings and income
  sources, each with this month's total. Edit name, colour and budget group; archive and restore.
- **Account**: your session (signed in, expiry, remember me), data stats, CSV export and a full JSON
  backup (including savings), plus the steps to change the password.
- **Settings**: currency (default USD), light, dark or system theme, opening balance, categories and
  income sources.

## UI

Built with [shadcn/ui](https://ui.shadcn.com) (Radix primitives) on Tailwind CSS v4, with
[lucide](https://lucide.dev) icons, [sonner](https://sonner.emilkowal.ski) toasts and
[recharts](https://recharts.org) charts. recharts loads on demand, so the first screen stays light.
Colours, radii and money semantics (`income`, `expense`, `brand`) are CSS variables in
`src/index.css`, with a near-black dark theme and a neutral light theme. Add more components with:

```bash
npx shadcn@latest add <component>
```

## Project layout

```
src/                React app: lazy routes, shadcn/ui components (src/components/ui),
                    Tailwind v4 design tokens in src/index.css, hooks
shared/             Pure TS shared by client + server: zod schemas, dates, money,
                    budget engine, recurring engine (+ unit tests)
server/             Hono API: auth (PBKDF2 + HMAC-signed cookie), R2 JSON store with
                    ETag compare-and-swap, rate limiting, data operations
functions/api/      Pages Function entry → server/app.ts
cron/               Cron Worker (wrangler.toml + src/index.ts) sharing server/data.ts
e2e/                Playwright tests (login, add transaction)
scripts/            hash-password, generate-icons
public/             _headers (CSP and security headers), icons, theme-init.js
```

### Data layout in R2

| Key                            | Contents                                                                  |
| ------------------------------ | ------------------------------------------------------------------------- |
| `transactions/YYYY-MM.json`    | `{ items: Transaction[] }`, one object per month                          |
| `recurring.json`               | `{ items: Recurring[] }`                                                  |
| `categories.json`              | `{ expense: Category[], income: Category[] }` (defaults until first edit) |
| `settings.json`                | currency, timezone, opening balance, last-used categories                 |
| `savings.json`                 | `{ items: SavingsEntry[] }` deposits and withdrawals by income source     |
| `security/login-attempts.json` | rate-limit counters (hashed client keys)                                  |

Amounts are stored as integer cents. Every write is a read-modify-write that uses a conditional put
(`onlyIf: { etagMatches }`, or `etagDoesNotMatch: '*'` when creating), with retries, so concurrent
writes (for example, the cron and the app at the same moment) never lose updates.

## Local development

Requirements: Node 20+ and npm.

```bash
npm install
```

Create `.dev.vars` (gitignored) from `.env.example`:

```bash
cp .env.example .dev.vars
```

```bash
npm run hash-password -- --secret
```

Paste the printed `AUTH_PASSWORD_HASH` and `SESSION_SECRET` into `.dev.vars` and set `AUTH_USERNAME`.

Run the API (Pages Functions with local R2 simulation) in one terminal:

```bash
npm run dev:api
```

And Vite with hot reload in a second one; it proxies `/api` to the first:

```bash
npm run dev
```

Open http://localhost:5173. Local R2 data lives in `.wrangler/state`. Delete that folder to reset.
(Chrome and Firefox accept the `Secure` session cookie on `http://localhost`.)

Or run the production build locally:

```bash
npm run preview
```

### Quality checks

```bash
npm run check
```

That runs typecheck, lint, the format check, unit tests and the build. The other checks:

```bash
npm run test:e2e
```

```bash
npm run doctor
```

`npm run test:e2e` runs Playwright against the real stack with throwaway credentials and isolated
state; install the browser first with `npx playwright install chromium`. `npm run doctor` runs
react-doctor.

## Deploying to Cloudflare

### 1. Create the R2 buckets (private, separate dev and prod)

```bash
npx wrangler login
```

```bash
npx wrangler r2 bucket create money-app-data
```

```bash
npx wrangler r2 bucket create money-app-data-dev
```

Do **not** enable public access or create R2 API tokens. The app reaches R2 only through the
`BUCKET` binding.

### 2. Create the Pages project

```bash
npx wrangler pages project create money-app --production-branch main
```

`wrangler.toml` binds `money-app-data` to production deployments and `money-app-data-dev` to
preview deployments.

### 3. Secrets

Generate the values:

```bash
npm run hash-password -- --secret
```

Then store them as Pages secrets for production. Each command prompts for the value, so nothing
lands in your shell history:

```bash
npx wrangler pages secret put AUTH_USERNAME --project-name money-app
```

```bash
npx wrangler pages secret put AUTH_PASSWORD_HASH --project-name money-app
```

```bash
npx wrangler pages secret put SESSION_SECRET --project-name money-app
```

Use the dashboard (Pages → Settings → Variables and Secrets → Preview) for preview deployments if you
use them.

### 4. Deploy

```bash
npm run deploy
```

That builds the app, runs `wrangler pages deploy dist`, and deploys the cron Worker
(`cron/wrangler.toml`, hourly at :15; generation uses your timezone's "today", so hourly runs make
entries appear on time anywhere). The cron Worker needs no secrets and has no public URL.

### GitHub Actions

`.github/workflows/ci.yml` runs typecheck, lint, format, unit tests, the build and e2e on every push
and pull request, and deploys on pushes to `main`. Add these repository secrets:

- `CLOUDFLARE_API_TOKEN`: a token with _Cloudflare Pages: Edit_ and _Workers Scripts: Edit_
- `CLOUDFLARE_ACCOUNT_ID`

Without them, the deploy job is skipped.

### Custom domain

Add it under Pages → Custom domains. The API stays on the same origin automatically, so cookies are
first-party and no CORS is needed.

## Changing the password

```bash
npm run hash-password
```

```bash
npx wrangler pages secret put AUTH_PASSWORD_HASH --project-name money-app
```

Then redeploy (`npm run deploy`, or re-run the workflow) so the new secret is picked up. Sessions are
bound to a fingerprint of the username and password hash, so **changing the password signs out every
device**. To sign everything out without changing the password, rotate `SESSION_SECRET`.

## Security notes

- Password stored only as PBKDF2-SHA256 (100k iterations, the Workers maximum) and compared in constant time.
- Session: HMAC-SHA256-signed token in a `__Host-` cookie (`HttpOnly; Secure; SameSite=Strict`).
  "Remember me" sets a 30-day cookie that renews as you use it; otherwise it is a session cookie whose
  token expires after 12 h.
- Login is rate limited: 5 failures per client per 15 min, plus a global cap of 50, stored in R2
  (strongly consistent, unlike KV) and returning `Retry-After`.
- Every `/api` route except login, logout, the session probe and health requires a valid session.
  Mutations also require a same-origin `Origin` and `application/json` (defence in depth on top of
  SameSite).
- Inputs are validated with zod on the server and checked in the forms on the client. Request bodies
  are capped at 64 KB.
- Headers: strict CSP (no inline or third-party scripts; inline styles are allowed because the
  Radix/shadcn primitives and toasts inject small `<style>` tags), HSTS, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer`, Permissions-Policy, COOP and CORP. API responses are `no-store`, and
  the service worker never caches `/api`.
- No secrets in the repo: `.dev.vars` and `.env*` are gitignored, and `.env.example` documents them.

## Free tier fit

Pages, Functions (100k requests/day), one cron Worker, R2 (10 GB, 1M writes and 10M reads per month)
and no KV or Durable Objects. A personal tracker uses a tiny fraction of this.
