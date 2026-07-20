# GCP Resources Needed

List of GCP things to create for this project.

## 1. Project
One GCP project to hold everything. Example name: `cyber-sandbox-hit`.

## 2. Google OAuth (Login)
- OAuth 2.0 Web client + consent screen for React (frontend login)
- Backend verifies Google ID tokens (audience = OAuth client ID)

## 3. Secret Manager
Store secrets, passwords, API keys. No secrets in code.

## 4. Cloud Run (Backend)
Runs FastAPI backend. Python 3.11. Linux container.

## 5. Artifact Registry
Stores the scanner Docker image.

## 6. Cloud Run Jobs
Runs the scanner. Linux containers. Created when scan starts, deleted when done.

## 7. Cloud SQL for PostgreSQL
Stores users and scan configs.

## 8. Firestore
Native mode. Stores scan logs, AI results, events.

## 9. Vertex AI (LLM)
Runs the Gemini model that matches scan results to CVEs.

## 10. Vertex AI (Pipelines / Training)
Runs anomaly detection on scan logs.

## 11. Cloud Logging
Collects all logs in one place (log buckets).

## 12. Chronicle (Google Security Operations)
SIEM. Reads logs, finds threats.

## 13. Cloud Monitoring & Cloud Trace
Tracks app performance and errors.

## 14. GitHub Actions Setup (not GCP infra, but needs GCP access)
Workload Identity Federation pool + service account so GitHub can deploy to GCP.

## 15. Cloud Run (Frontend)
Hosts React SPA as a static container. Auto-deploys from GitHub on push to `main`. Serve behind Cloud CDN for HTTPS + caching. Backend (FastAPI on Cloud Run) must allow the frontend origin in CORS.

---

## Quick Table

| # | Resource | Why |
|---|----------|-----|
| 1 | Project | Hold everything |
| 2 | Google OAuth client | User login |
| 3 | Secret Manager | Store secrets |
| 4 | Cloud Run | Run backend |
| 5 | Artifact Registry | Store image |
| 6 | Cloud Run Jobs | Run scanner |
| 7 | Cloud SQL | User + config data |
| 8 | Firestore | Logs + results |
| 9 | Vertex AI (LLM) | CVE matching |
| 10 | Vertex AI (Pipelines) | Anomaly detection |
| 11 | Cloud Logging | Collect logs |
| 12 | Chronicle | Threat detection |
| 13 | Cloud Monitoring | App monitoring |
| 14 | Workload Identity Federation | CI/CD access |
| 15 | Cloud Run (static SPA) | Host React frontend |

## Build Order
1. Project + Secret Manager
2. Google OAuth client
3. Cloud SQL + Firestore
4. Artifact Registry + Cloud Run
5. Cloud Run (frontend)
6. Vertex AI (LLM + Pipelines)
7. Cloud Logging + Chronicle + Cloud Monitoring
8. GitHub Actions hookup (Workload Identity Federation)
