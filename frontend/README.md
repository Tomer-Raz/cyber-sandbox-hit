# Sandbox Playground — Frontend

React SPA for the **Sandbox Playground Cyber Platform** — an AI-driven, automated
penetration-testing console. This is the **frontend only**. It ships with a complete
in-browser **mock backend**, so the entire experience runs end-to-end with **no FastAPI
server and no Google OAuth client** required.

> UI is **Ant Design v5** with a single `ConfigProvider` theme (light, primary `#1677ff`).
> Deliberately flat and minimal — default antd styling, generous spacing, no custom design
> system and almost no bespoke CSS.

---

## Quick start

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Click **Continue with Google** on the login screen — in demo mode this signs you in
instantly, as a sample analyst with realistic, simulated scan data.

| Script              | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR                      |
| `npm run build`     | Type-check (`tsc`) **and** production build   |
| `npm run preview`   | Serve the built `dist/` (port 4173)           |
| `npm run typecheck` | `tsc --noEmit` only                           |
| `npm run lint`      | ESLint                                        |
| `npm run format`    | Prettier                                      |

---

## What works in demo mode

Everything is wired to a deterministic mock engine (`src/api/mock/`) that simulates the
real scan lifecycle on a clock:

- **Auth** — mock Google login/logout, JWT-shaped token, persisted session, protected routes.
- **Dashboard** — KPI `Statistic` cards, 7-day findings trend, severity mix, recent scans.
- **New Scan** — antd `Form` with target validation, scan-profile picker, engine options,
  authorization gate.
- **Live Scan Status** — a newly launched scan **progresses through every phase** (provision →
  scan → AI analysis → exploit validation → report) shown as antd `Steps` + `Progress`, with a
  streaming log and a cancel flow. Polls the mock every ~1.5 s.
- **Report** — risk dashboard gauge, AI summary, severity donut + category bar (Recharts), an
  expandable findings `Table` with real-world CVEs, event `Timeline`, and JSON / PDF export.
- **Settings** — profile, notification toggles, API-key rotation, session reset.

Layout is responsive via antd `Layout` + `Grid`: a collapsible `Sider` on desktop, a `Drawer`
on mobile. Verified at 375px with no horizontal scrolling.

---

## Connecting a real backend / Google OAuth

All integration points are env-driven (see `.env.example`). Copy it to `.env.local`:

```ini
VITE_USE_MOCKS=false                       # call the real FastAPI backend
VITE_API_BASE_URL=https://your-api/api
VITE_AUTH_MODE=google                      # use real Google OAuth
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

- **API** — `src/api/index.ts` already branches between the mock engine and an Axios client
  (`src/api/client.ts`) that attaches the bearer token and handles `401`s. The expected REST
  shape: `GET /dashboard`, `GET /scans`, `GET /scans/:id`, `GET /scans/:id/status`,
  `GET /scans/:id/report`, `POST /scans`, `POST /scans/:id/cancel`.
- **Auth** — `src/auth/AuthProvider.tsx` swaps between `MockAuthProvider` and the real
  `GoogleAuthProvider` (`@react-oauth/google`) purely on `VITE_AUTH_MODE`. No code changes needed.

---

## Project structure

```
frontend/
├── index.html
├── Dockerfile / nginx.conf     # static container for Cloud Run
├── src/
│   ├── main.tsx                # entry: ConfigProvider theme + antd App + Router + Auth
│   ├── App.tsx                 # routes (code-split via React.lazy)
│   ├── index.css               # ~20 lines; antd provides the design system
│   ├── types/                  # shared domain models
│   ├── lib/
│   │   ├── constants.ts        # severity/status/phase meta → antd Tag colours + chart hex
│   │   ├── notify.ts           # toast helper bridged to antd message/notification
│   │   └── format.ts, prng.ts
│   ├── api/
│   │   ├── client.ts           # Axios instance + interceptors
│   │   ├── index.ts            # API facade (mock ⇄ live)
│   │   └── mock/               # catalog + simulation engine
│   ├── auth/                   # AuthContext, mock + Google providers, RequireAuth
│   ├── store/                  # zustand scans cache
│   ├── components/
│   │   ├── Brand.tsx
│   │   ├── layout/AppLayout    # antd Layout: Sider + Header + Content + mobile Drawer
│   │   ├── charts/             # SeverityDonut, TrendArea, FindingsByCategoryBar, SeverityBar
│   │   └── scans/              # ScanTable, FindingsTable
│   └── pages/                  # Login, Dashboard, ScansList, NewScan, ScanStatus,
│                               # Report, Settings, NotFound
```

### Routes

| Path                 | View                          | Access    |
| -------------------- | ----------------------------- | --------- |
| `/login`             | Login                         | public    |
| `/`                  | Dashboard                     | protected |
| `/scans`             | All scans (search + filter)   | protected |
| `/scans/new`         | New scan configuration        | protected |
| `/scans/:id`         | Live scan status              | protected |
| `/scans/:id/report`  | Full report                   | protected |
| `/settings`          | Settings                      | protected |
| `*`                  | 404 (`Result`)                | public    |

---

## Tech stack

React 18 · TypeScript (strict) · Vite 5 · React Router 6 · **Ant Design v5** ·
`@ant-design/icons` · Zustand · Recharts · Axios · `@react-oauth/google`.

## Deployment

`npm run build` emits a static `dist/`. `Dockerfile` builds it into an nginx container for
**Cloud Run** (`nginx.conf` includes the SPA fallback rewrite to `/index.html`), deployed by
`.github/workflows/deploy-frontend.yml`.

---

*Academic project — HIT (Holon Institute of Technology). For authorized security testing only.*
