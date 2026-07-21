# Backend Tasks

List of things to build for the FastAPI backend.

> **Infrastructure is already provisioned** (Terraform in `infrastructure/gcp/`, applied
> 2026-07-22). Nothing below needs to create GCP resources — they exist. What the
> backend must do is read the env vars Cloud Run already injects and use them.
> See [Provisioned Contract](#0-provisioned-contract) for exact names and values.

## 0. Provisioned Contract

Env vars injected into the `sandbox-dev-backend` Cloud Run service by Terraform.
Do not hardcode any of these — read them all through `config.py`.

| Env var | Value | Use |
|---|---|---|
| `GCP_PROJECT_ID` | `cyber-sandbox-hit` | all SDK clients |
| `GCP_REGION` | `europe-west1` | Cloud Run Jobs |
| `ENVIRONMENT` | `dev` | log level, debug flags |
| `DB_INSTANCE_CONNECTION_NAME` | `cyber-sandbox-hit:europe-west1:sandbox-dev-pg` | Cloud SQL connector |
| `DB_HOST` | instance IP | direct connections only |
| `DB_NAME` | `sandbox` | |
| `DB_USER` | `sandbox_app` | password login |
| `DB_PASSWORD` | *(Secret Manager ref)* | injected, never read the secret directly |
| `JWT_SIGNING_KEY` | *(Secret Manager ref)* | only if issuing own session tokens |
| `FIRESTORE_DATABASE` | `(default)` | |
| `ARTIFACT_REGISTRY_REPO` | `sandbox-images` | |
| `SCANNER_JOB_NAME` | `sandbox-dev-scanner` | job to execute per scan |
| `VERTEX_LOCATION` | `europe-west1` | |
| `VERTEX_MODEL` | `gemini-2.0-flash` | |
| `GOOGLE_OAUTH_CLIENT_ID` | `321010762291-kqipett824lfoms10vu57nd0ls8v9a54.apps.googleusercontent.com` | **required ID-token audience** |
| `ALLOWED_ORIGINS` | frontend Cloud Run URL | CORS allowlist |

Runtime facts the container must satisfy:

- **Listen on port 8080.** Cloud Run's startup probe is a TCP check there.
- **Expose `GET /health`.** The liveness probe hits it every 30s; failing it
  restarts the container.
- Runs as `sandbox-dev-backend@cyber-sandbox-hit.iam.gserviceaccount.com` via ADC —
  no key files. It already holds `run.developer`, `cloudsql.client`,
  `datastore.user`, `aiplatform.user`, plus `serviceAccountUser` on the scanner SA.
- Scans egress from the default Cloud Run range (private networking is off for
  cost). There is no fixed egress IP to whitelist on targets yet.

## 1. Project Setup
- Python 3.11+
- Virtual env (`venv` or `poetry`)
- Folder structure:
  - `app/main.py` (entrypoint)
  - `app/routers/` (API routes)
  - `app/models/` (SQLAlchemy models)
  - `app/schemas/` (Pydantic schemas)
  - `app/services/` (business logic)
  - `app/core/` (config, security)
  - `app/db/` (database session)
  - `tests/`

## 2. Packages to Install
- `fastapi`
- `uvicorn` (server)
- `sqlalchemy` + `asyncpg` (Cloud SQL for PostgreSQL)
- `cloud-sql-python-connector` (Cloud SQL connectivity)
- `alembic` (DB migrations)
- `pydantic` + `pydantic-settings`
- `google-auth` (ADC + Google ID-token verification)
- `google-cloud-run` (Cloud Run Jobs)
- `google-cloud-firestore` (Firestore)
- `google-cloud-aiplatform` (Vertex AI)
- `google-cloud-secret-manager`
- `python-owasp-zap-v2.4`
- `python-jose` (JWT)
- `httpx` (async HTTP)
- `pytest` + `pytest-asyncio`

## 3. Config
- `.env` file (local only)
- `config.py` with Pydantic Settings, fields matching §0 exactly
- Secrets arrive **already injected** as env vars by Cloud Run (`DB_PASSWORD`,
  `JWT_SIGNING_KEY`). Do not call Secret Manager for these at runtime — the
  service account can read them, but injection is simpler and avoids a network
  hop on cold start.
- Fail fast at startup if `GOOGLE_OAUTH_CLIENT_ID` is unset. An empty audience
  silently disables the only check standing between the API and the internet.
- Secrets that exist: `sandbox-dev-db-password`, `sandbox-dev-jwt-signing-key`,
  `sandbox-dev-oauth-client-secret` (the last one is **empty and unused** — the
  ID-token flow needs no client secret; it is only needed if the backend ever
  does authorization-code exchange).

## 4. Authentication

The frontend sends a **Google ID token** (JWT) as `Authorization: Bearer <jwt>`.
Verified working end to end as of 2026-07-22.

- Verify with `google.oauth2.id_token.verify_oauth2_token(token, Request(), CLIENT_ID)`
  — signature, expiry and **`aud` == `GOOGLE_OAUTH_CLIENT_ID`**.
- Also assert `iss` is `accounts.google.com` or `https://accounts.google.com`.
- **Do not authenticate by calling the `userinfo` endpoint.** That accepts an
  access token minted for *any* Google OAuth client, so any unrelated app's token
  would authenticate as our user. The audience check is the whole defence, and
  only ID tokens carry one. This was the original frontend implementation and was
  replaced for exactly this reason.
- Dependency `get_current_user` → upserts the `User` row on first sight, keyed by
  the token's `sub` (never by email — emails can change).
- Role-based access (admin, user)
- Reject expired tokens (tokens last ~1h; the SPA drops its session at `exp`)
- OAuth app is in **Testing**: only accounts listed as test users in the consent
  screen can sign in at all. Add teammates there, not in code.

## 5. Database (Cloud SQL for PostgreSQL)

### Models (SQLAlchemy)
- `User` (id, email, name, role, created_at)
- `Target` (id, user_id, url, description, approved)
- `ScanConfig` (id, user_id, target_id, scan_type, options, created_at)
- `Scan` (id, config_id, status, started_at, finished_at)

### Setup
- Async engine + session
- Alembic migrations
- Connection pooling
- Connect via `cloud-sql-python-connector` using `DB_INSTANCE_CONNECTION_NAME`.
  The instance has **no authorized networks and `ssl_mode=ENCRYPTED_ONLY`**, so
  the connector is the only way in — a plain `asyncpg` connection to `DB_HOST`
  will be refused.
- Two logins exist: `sandbox_app` (password, from `DB_PASSWORD`) and the IAM user
  `sandbox-dev-backend@cyber-sandbox-hit.iam` (`enable_iam_auth=True`, no
  password). Prefer IAM; keep the password path for migrations and local work.
- The instance may be **stopped** to save cost while nobody is using it. Expect
  connection failures and surface them clearly rather than hanging.

## 6. Firestore
- Client wrapper
- Collections: `scan_logs`, `ai_results`, `exploit_results`, `audit_events`
- Insert helpers
- Query helpers (by scan_id, by date)
- Composite indexes already exist — **write queries that match them or they fail
  at runtime**:
  - `scan_logs`: `scan_id` ASC + `timestamp` DESC
  - `ai_results`: `scan_id` ASC + `severity` DESC
  - `audit_events`: `user_id` ASC + `timestamp` DESC
- Every document needs `timestamp` and a `scan_id` correlation ID.

## 7. API Routes

### Auth (`/api/auth`)
- `GET /me` — current user

### Targets (`/api/targets`)
- `GET /` — list user targets
- `POST /` — add target
- `DELETE /{id}` — remove target

### Scans (`/api/scans`)
- `GET /` — list user scans
- `POST /` — start new scan
- `GET /{id}` — get scan details
- `GET /{id}/status` — get progress
- `GET /{id}/report` — get full report
- `DELETE /{id}` — cancel scan

### Reports (`/api/reports`)
- `GET /{scan_id}` — full report with CVEs
- `GET /{scan_id}/export` — PDF/JSON export

## 8. Services

### Cloud Run Job Service
- **Do not create a job per scan.** The job `sandbox-dev-scanner` already exists;
  start an *execution* of it with per-scan env overrides
  (`run_v2.RunJobRequest` with `overrides.container_overrides`).
  Creating and deleting a job per scan is slower, races on names, and needs
  broader IAM than the service account has.
- Pass scan config as overrides: `TARGET_URL`, `SCAN_ID`, `SCAN_POLICY`.
  `GCP_PROJECT_ID`, `FIRESTORE_DATABASE`, `VERTEX_LOCATION`, `VERTEX_MODEL` are
  already baked into the job template.
- Poll execution status via the Executions API.
- Teardown is automatic — the task container exits and Cloud Run reclaims it.
  `max_retries=0`, so a failed scan stays failed instead of silently re-running
  against a target. `timeout=1800s` is the hard ceiling.
- Job runs as `sandbox-dev-scanner@…`, which can write Firestore and call Vertex
  AI but has no database or Cloud Run access.

### ZAP Service
- Call ZAP REST API inside container
- Start scan, poll progress
- Get raw findings

### AI Service
- Send ZAP findings to Vertex AI
- Parse LLM response (CVE list, severity, CVSS)
- Cache common results

### Exploit Service
- Run exploit scripts in container
- Validate vulns
- Return confirmed/false-positive

### Log Service
- Write events to Firestore
- Include scan_id, timestamp, event_type

## 9. Background Tasks
- Use FastAPI `BackgroundTasks` or Celery
- Long scan = async task
- Status updates via DB / Firestore

## 10. Security
- CORS config — allow only the origins in `ALLOWED_ORIGINS` (already set to the
  frontend Cloud Run URL). Never `allow_origins=["*"]`: the service is public on
  the internet and the ID token is the only gate.
- Rate limiting (per user)
- Input validation (Pydantic)
- No secrets in code (Secret Manager)
- Authorization checks per route
- Audit log all scan actions
- **Target authorization is enforced here and nowhere else.** A scan may only run
  against a `Target` row the requesting user owns and that is marked `approved`.
  With private networking off there is no fixed egress IP for target owners to
  whitelist, so this check is the only thing scoping the scanner. Reject
  RFC1918/loopback/metadata addresses (`169.254.169.254`) outright.

## 11. Logging & Monitoring
- Structured logging (JSON) — Cloud Logging parses `severity` and `message`
  from JSON stdout automatically; no agent needed.
- Cloud Monitoring / Cloud Trace integration (`cloudtrace.agent` already granted)
- Request ID middleware — reuse the same ID as the Firestore `scan_id`
  correlation where the request starts a scan.
- Error handlers
- Alert policies already exist and will fire on: backend 5xx > 5 in 5 min, and
  any failed scan-job task. Both email `tomer532010@gmail.com`. Returning 5xx for
  expected conditions will page a human — use 4xx for client errors.
- Logs route to the `sandbox-dev-security-logs` bucket, 30-day retention.

## 12. Testing
- Unit tests (services, models)
- Integration tests (routes + DB)
- Mock GCP SDKs
- Coverage 80%+

## 13. Deployment
- Dockerfile (Linux, Python 3.11), **must listen on `$PORT` / 8080**
- `requirements.txt` or `pyproject.toml`
- GitHub Actions workflow — **does not exist yet**; copy
  `.github/workflows/deploy-frontend.yml`, which already has working keyless auth:
  - Lint + test
  - Build image → `europe-west1-docker.pkg.dev/cyber-sandbox-hit/sandbox-images/sandbox-dev-backend`
  - Deploy to Cloud Run service `sandbox-dev-backend` in `europe-west1`
  - Auth via Workload Identity Federation as `sandbox-dev-gh-deployer@…`
    (repo secrets `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` — the
    provider is locked to `Tomer-Raz/cyber-sandbox-hit`)
- Terraform sets the image only on first apply, then ignores it — CI owns the tag
  from then on. Deploys will not fight Terraform.
- Health check endpoint `/health` (required — see §0)

---

## Build Order

Prerequisites — **all done**: GCP infra applied, OAuth client created, frontend
sending real ID tokens (against mock data until this backend answers).

1. Project setup + packages
2. Config (§0 env vars) + `/health` + Dockerfile listening on 8080
3. Deploy the skeleton to Cloud Run — replaces the placeholder hello container
   that is currently public at the backend URL
4. Auth (Google ID-token validation, audience check) — **the first thing that
   matters**; the frontend is already sending the credential for it
5. DB models + migrations
6. Target routes (incl. the authorization rules in §10)
7. Firestore wrapper
8. Cloud Run Job service (execute `sandbox-dev-scanner`)
9. ZAP service
10. Scan routes (start + status)
11. Vertex AI service
12. Exploit service
13. Report routes
14. Logging + monitoring
15. Tests
16. CI/CD workflow

Then flip the frontend to `VITE_USE_MOCKS=false` and the loop is closed.
