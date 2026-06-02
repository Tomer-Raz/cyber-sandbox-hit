# Sandbox Playground — Frontend

React SPA for the **Sandbox Playground Cyber Platform** — an AI-driven, automated
penetration-testing console. This is the **frontend only**. It ships with a complete
in-browser **mock backend**, so the entire experience runs end-to-end with **no FastAPI
server and no Entra ID tenant** required.

> Aesthetic: a dark "security operations console" — deep ink, electric-cyan accents, a
> warm severity scale, blueprint grid + scanlines, and a Chakra Petch / Hanken Grotesk /
> JetBrains Mono type system.

---

## Quick start

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Click **Continue with Microsoft** on the login screen — in demo mode this signs you in
instantly as a sample analyst with realistic, simulated scan data.

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

- **Auth** — mock Entra ID login/logout, JWT-shaped token, persisted session, protected routes.
- **Dashboard** — KPIs, 7-day findings trend, severity mix, recent scans (auto-refreshing).
- **New Scan** — target validation, scan-profile picker, engine options, authorization gate.
- **Live Scan Status** — a newly launched scan **progresses through every phase** (provision →
  scan → AI analysis → exploit validation → report) with a streaming terminal log and a
  cancel flow. Polls the mock every ~1.5 s.
- **Report** — risk gauge, AI summary, severity donut + category bar charts (Recharts), a
  sortable / filterable / expandable findings table with real-world CVEs, and JSON / PDF export.
- **Settings** — profile, notification toggles, API-key rotation, session reset.

---

## Connecting a real backend / Entra ID

All integration points are env-driven (see `.env.example`). Copy it to `.env.local`:

```ini
VITE_USE_MOCKS=false                       # call the real FastAPI backend
VITE_API_BASE_URL=https://your-api/api
VITE_AUTH_MODE=msal                        # use real Microsoft Entra ID
VITE_ENTRA_CLIENT_ID=...
VITE_ENTRA_TENANT_ID=...
VITE_ENTRA_REDIRECT_URI=http://localhost:5173
VITE_API_SCOPE=api://<client-id>/access_as_user
```

- **API** — `src/api/index.ts` already branches between the mock engine and an Axios client
  (`src/api/client.ts`) that attaches the bearer token and handles `401`s. The expected REST
  shape: `GET /dashboard`, `GET /scans`, `GET /scans/:id`, `GET /scans/:id/status`,
  `GET /scans/:id/report`, `POST /scans`, `POST /scans/:id/cancel`.
- **Auth** — `src/auth/AuthProvider.tsx` swaps between `MockAuthProvider` and the real
  `MsalAuthProvider` (`@azure/msal-react`) purely on `VITE_AUTH_MODE`. No code changes needed.

---

## Project structure

```
frontend/
├── index.html
├── tailwind.config.js          # design tokens (colors, fonts, animations)
├── src/
│   ├── main.tsx                # entry: Router + AuthProvider
│   ├── App.tsx                 # routes + Backdrop + Toaster
│   ├── index.css               # CSS variables, base styles, utilities
│   ├── types/                  # shared domain models
│   ├── lib/                    # cn, formatting, prng, constants (severity/status/phase meta)
│   ├── api/
│   │   ├── client.ts           # Axios instance + interceptors
│   │   ├── index.ts            # API facade (mock ⇄ live)
│   │   └── mock/               # catalog + simulation engine
│   ├── auth/                   # AuthContext, mock + MSAL providers, RequireAuth
│   ├── store/                  # zustand stores (UI/toasts, scans cache)
│   ├── components/
│   │   ├── ui/                 # Button, Card, Badge, Field, Modal, Toaster, Icon, …
│   │   ├── layout/             # AppShell, Sidebar, Topbar, Backdrop
│   │   ├── charts/             # SeverityDonut, TrendArea, FindingsByCategoryBar
│   │   ├── dashboard/          # StatCard, SeverityBar
│   │   └── scans/              # ScanCard, PhaseStepper, FindingsTable
│   └── pages/                  # Login, Dashboard, ScansList, NewScan, ScanStatus, Report, Settings
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

---

## Tech stack

React 18 · TypeScript · Vite 5 · React Router 6 · Tailwind CSS 3 · Zustand · Recharts ·
Framer Motion · Axios · `@azure/msal-react`.

## Deployment

`npm run build` emits a static `dist/` suitable for **Azure Static Web Apps**. Because it's an
SPA, configure a fallback rewrite to `/index.html` for client-side routing.

---

*Academic project — HIT (Holon Institute of Technology). For authorized security testing only.*
