# Backend Tasks

List of things to build for the FastAPI backend.

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
- `sqlalchemy` + `asyncpg` or `pyodbc` (Azure SQL)
- `alembic` (DB migrations)
- `pydantic` + `pydantic-settings`
- `azure-identity`
- `azure-mgmt-containerinstance` (ACI)
- `azure-cosmos` (Cosmos DB)
- `azure-ai-inference` (AI Foundry)
- `azure-keyvault-secrets`
- `python-owasp-zap-v2.4`
- `msal` (token validation)
- `python-jose` (JWT)
- `httpx` (async HTTP)
- `pytest` + `pytest-asyncio`

## 3. Config
- `.env` file (local only)
- `config.py` with Pydantic Settings
- Load secrets from Key Vault in production
- Variables: DB connection, Cosmos endpoint, ACR creds, AI Foundry key, Entra tenant ID

## 4. Authentication
- Validate JWT tokens from Entra ID
- Dependency `get_current_user`
- Role-based access (admin, user)
- Reject expired tokens

## 5. Database (Azure SQL)

### Models (SQLAlchemy)
- `User` (id, email, name, role, created_at)
- `Target` (id, user_id, url, description, approved)
- `ScanConfig` (id, user_id, target_id, scan_type, options, created_at)
- `Scan` (id, config_id, status, started_at, finished_at)

### Setup
- Async engine + session
- Alembic migrations
- Connection pooling

## 6. Cosmos DB
- Client wrapper
- Containers: `scan_logs`, `ai_results`, `exploit_results`, `audit_events`
- Insert helpers
- Query helpers (by scan_id, by date)

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

### ACI Service
- Provision Windows container from ACR
- Pass scan config as env vars
- Poll container status
- Tear down on finish or fail

### ZAP Service
- Call ZAP REST API inside container
- Start scan, poll progress
- Get raw findings

### AI Service
- Send ZAP findings to AI Foundry
- Parse LLM response (CVE list, severity, CVSS)
- Cache common results

### Exploit Service
- Run exploit scripts in container
- Validate vulns
- Return confirmed/false-positive

### Log Service
- Write events to Cosmos
- Include scan_id, timestamp, event_type

## 9. Background Tasks
- Use FastAPI `BackgroundTasks` or Celery
- Long scan = async task
- Status updates via DB / Cosmos

## 10. Security
- CORS config (allow React origin only)
- Rate limiting (per user)
- Input validation (Pydantic)
- No secrets in code (Key Vault)
- Authorization checks per route
- Audit log all scan actions

## 11. Logging & Monitoring
- Structured logging (JSON)
- Application Insights integration
- Request ID middleware
- Error handlers

## 12. Testing
- Unit tests (services, models)
- Integration tests (routes + DB)
- Mock Azure SDKs
- Coverage 80%+

## 13. Deployment
- Dockerfile (Linux, Python 3.11)
- `requirements.txt` or `pyproject.toml`
- GitHub Actions workflow:
  - Lint + test
  - Build image
  - Push to ACR
  - Deploy to App Service
- Health check endpoint `/health`

---

## Build Order
1. Project setup + packages
2. Config + Key Vault
3. DB models + migrations
4. Auth (JWT validation)
5. Target routes
6. Cosmos DB wrapper
7. ACI service (container provisioning)
8. ZAP service
9. Scan routes (start + status)
10. AI Foundry service
11. Exploit service
12. Report routes
13. Logging + monitoring
14. Tests
15. Dockerfile + CI/CD
