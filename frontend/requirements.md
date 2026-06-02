# Frontend Tasks

List of things to build for the React frontend.

## 1. Project Setup
- Create React app (Vite or CRA)
- TypeScript
- ESLint + Prettier
- Folder structure: `components/`, `pages/`, `auth/`, `api/`, `hooks/`, `utils/`

## 2. Packages to Install
- `react`, `react-dom`
- `react-router-dom` (routing)
- `@azure/msal-browser` + `@azure/msal-react` (Entra ID login)
- `axios` (API calls)
- `recharts` or `chart.js` (charts)
- `tailwindcss` or MUI (styling)
- `zustand` or Redux Toolkit (state)

## 3. Authentication (Entra ID)
- MSAL config file (client ID, tenant ID, redirect URI)
- Login button
- Logout button
- Protected routes (redirect if not logged in)
- Attach JWT token to API calls

## 4. Pages

### Login Page
- Microsoft login button
- Redirect to dashboard after login

### Dashboard
- List of past scans
- Quick stats (total scans, vulns found, last scan)
- Start new scan button

### New Scan Page
- Form: target URL/IP, scan type, options
- Submit to backend
- Show queued message

### Scan Status Page
- Live progress bar
- Poll backend every few seconds
- Show current phase (provisioning, scanning, AI analysis, etc.)

### Report Page
- Full scan results
- CVE list with severity
- Charts: vulns by severity, by type
- Export PDF/JSON button

### Settings Page
- User profile
- API key management (if needed)
- Logout

## 5. Components
- Navbar (logo, user menu)
- Sidebar (navigation)
- Scan card
- Vuln severity badge
- Progress bar
- Data table (sortable)
- Loading spinner
- Toast notifications

## 6. API Layer
- Axios instance with base URL
- Interceptor to add JWT token
- Functions for each endpoint:
  - `getScans()`
  - `createScan(config)`
  - `getScanStatus(id)`
  - `getReport(id)`
  - `getUser()`

## 7. State Management
- Auth state (user, token)
- Scans list cache
- Current scan progress

## 8. Routing
- `/login`
- `/` (dashboard, protected)
- `/scans/new` (protected)
- `/scans/:id` (status, protected)
- `/scans/:id/report` (protected)
- `/settings` (protected)

## 9. Styling
- Dark theme (cyber look)
- Responsive (mobile + desktop)
- Color code by severity (red/orange/yellow/green)

## 10. Build & Deploy
- Build script (`npm run build`)
- Deploy to Azure Static Web Apps (auto-deploy via GitHub Actions on push to `main`)
- Environment variables: API URL, MSAL client ID

---

## Build Order
1. Setup project + packages
2. MSAL login flow
3. API layer + axios setup
4. Routing + protected routes
5. Dashboard page
6. New scan form
7. Scan status page (polling)
8. Report page (charts)
9. Settings
10. Styling polish + deploy
