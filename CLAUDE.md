# Sandbox Playground Cyber Platform

## Project Overview
Cloud-native, AI-driven cybersecurity platform for automated penetration testing. Built on Google Cloud Platform (GCP), it allows users to define targets, orchestrate scans via ephemeral containers, and analyze results with AI/ML.

## Tech Stack

### Frontend
- **Framework**: React (SPA)
- **Auth**: Google OAuth 2.0 (Google Identity Services)
- **Charting**: Visualization libraries for vulnerability reports

### Backend
- **Framework**: Python + FastAPI (async)
- **ORM**: SQLAlchemy (Cloud SQL for PostgreSQL)
- **Container Orchestration**: `google-cloud-run` SDK (Cloud Run Jobs)
- **AI Integration**: Vertex AI SDK

### Infrastructure (GCP)
- **Compute**: Cloud Run Jobs — ephemeral Linux containers
- **Registry**: Artifact Registry
- **Hosting**: Cloud Run (FastAPI API + static SPA container)
- **CI/CD**: GitHub Actions

### Scanning & Exploit Engine
- **Scanner**: OWASP ZAP (headless DAST) via `python-owasp-zap-v2.4`
- **Payloads**: Custom Python scripts (SQLi, XSS, command injection)
- **Container Image**: Linux base + Python + ZAP + exploit scripts

### AI / ML
- **Vertex AI (Gemini)**: LLM-based CVE template matching from ZAP output
- **Vertex AI (Pipelines / Training)**: Scikit-Learn/PyTorch anomaly detection pipeline

### Data
- **Cloud SQL for PostgreSQL**: User accounts, target configs (via SQLAlchemy)
- **Firestore (Native mode, Serverless)**: Unstructured scan logs, AI results, telemetry (via `google-cloud-firestore` SDK)

### Monitoring
- **Chronicle (Google Security Operations)**: SIEM — ingests from Firestore / Cloud Logging and Cloud Identity
- **Cloud Logging queries / BigQuery SQL**: anomaly event search

## Architecture Flow
1. User authenticates via Google OAuth
2. User configures target IP/domain and scan parameters → saved to Cloud SQL
3. React sends REST request to FastAPI to start scan
4. FastAPI provisions a Cloud Run Job (pulls Linux image from Artifact Registry)
5. Container runs ZAP headless scan on target
6. ZAP results → Vertex AI for CVE template matching
7. If match found → custom exploit scripts validate vulnerability
8. Container torn down immediately after scan
9. All logs/results → Firestore
10. Vertex AI analyzes Firestore data for anomalies
11. Chronicle ingests events; user views reports in React dashboard

## Project Structure (Planned)
```
cyber-sandbox-hit/
├── frontend/              # React SPA
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Dashboard, scan config, reports
│   │   ├── auth/          # Google OAuth integration
│   │   └── api/           # FastAPI client calls
│   └── package.json
├── backend/               # FastAPI application
│   ├── app/
│   │   ├── main.py        # FastAPI entrypoint
│   │   ├── routers/       # API route handlers
│   │   ├── models/        # SQLAlchemy models
│   │   ├── services/      # Business logic (Cloud Run orchestration, AI calls)
│   │   ├── schemas/       # Pydantic schemas
│   │   └── config.py      # Settings and GCP credentials
│   └── requirements.txt
├── scanner/               # Scanning engine
│   ├── Dockerfile         # Linux container image
│   ├── scripts/           # ZAP automation + exploit scripts
│   └── payloads/          # Crafted payload templates
├── ml/                    # ML pipeline
│   ├── train.py           # Anomaly detection training
│   └── pipeline.yml       # Vertex AI pipeline definition
├── infra/                 # Infrastructure as Code
│   └── gcp/               # Terraform files
├── .github/workflows/     # GitHub Actions CI/CD
├── CLAUDE.md
└── README.md
```

## Development Guidelines
- All backend code is Python 3.11+ with type hints
- Use `async/await` throughout FastAPI handlers
- Container instances must be destroyed immediately after scan completion
- Never store credentials in code — use Secret Manager / environment variables
- All scan operations must be authorized and scoped to user-defined targets only
- Firestore documents should include timestamps and scan correlation IDs
- Frontend uses functional React components with hooks

## Key GCP SDKs
```
google-cloud-run               # Cloud Run Jobs provisioning
google-cloud-firestore         # Firestore access
google-cloud-aiplatform        # Vertex AI calls
google-auth                    # Authentication (Application Default Credentials)
python-owasp-zap-v2.4          # ZAP API
sqlalchemy                     # Cloud SQL ORM
google-cloud-secret-manager    # Secret Manager
@react-oauth/google            # Google OAuth (frontend, npm)
fastapi                        # Backend framework
uvicorn                        # ASGI server
```

## Ethical Use
This platform is for **authorized security testing only**. All targets must be explicitly approved. The platform is built as an academic project for bachelor's studies at HIT.
