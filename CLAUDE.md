# Sandbox Playground Cyber Platform

## Project Overview
Cloud-native, AI-driven cybersecurity platform for automated penetration testing. Built on Azure, it allows users to define targets, orchestrate scans via ephemeral containers, and analyze results with AI/ML.

## Tech Stack

### Frontend
- **Framework**: React (SPA)
- **Auth**: SAML with Microsoft Entra ID
- **Charting**: Visualization libraries for vulnerability reports

### Backend
- **Framework**: Python + FastAPI (async)
- **ORM**: SQLAlchemy (Azure SQL)
- **Container Orchestration**: `azure-mgmt-containerinstance` SDK
- **AI Integration**: Azure AI Inference SDK

### Infrastructure (Azure)
- **Compute**: Azure Container Instances (ACI) — ephemeral Windows containers
- **Registry**: Azure Container Registry (ACR)
- **Hosting**: Azure App Service (FastAPI)
- **CI/CD**: GitHub Actions

### Scanning & Exploit Engine
- **Scanner**: OWASP ZAP (headless DAST) via `python-owasp-zap-v2.4`
- **Payloads**: Custom Python scripts (SQLi, XSS, command injection)
- **Container Image**: Windows base + Python + ZAP + exploit scripts

### AI / ML
- **Azure AI Foundry**: LLM-based CVE template matching from ZAP output
- **Azure Machine Learning**: Scikit-Learn/PyTorch anomaly detection pipeline

### Data
- **Azure SQL (Serverless)**: User accounts, target configs (via SQLAlchemy)
- **Azure Cosmos DB (Serverless)**: Unstructured scan logs, AI results, telemetry (via `azure-cosmos` SDK)

### Monitoring
- **Microsoft Sentinel**: SIEM — ingests from Cosmos DB and Entra ID
- **KQL**: Kusto queries for anomaly event search

## Architecture Flow
1. User authenticates via Entra ID
2. User configures target IP/domain and scan parameters → saved to Azure SQL
3. React sends REST request to FastAPI to start scan
4. FastAPI provisions ACI (pulls Windows image from ACR)
5. Container runs ZAP headless scan on target
6. ZAP results → Azure AI Foundry for CVE template matching
7. If match found → custom exploit scripts validate vulnerability
8. Container torn down immediately after scan
9. All logs/results → Cosmos DB
10. Azure ML analyzes Cosmos data for anomalies
11. Sentinel ingests events; user views reports in React dashboard

## Project Structure (Planned)
```
cyber-sandbox-hit/
├── frontend/              # React SPA
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Dashboard, scan config, reports
│   │   ├── auth/          # SAML Entra ID integration
│   │   └── api/           # FastAPI client calls
│   └── package.json
├── backend/               # FastAPI application
│   ├── app/
│   │   ├── main.py        # FastAPI entrypoint
│   │   ├── routers/       # API route handlers
│   │   ├── models/        # SQLAlchemy models
│   │   ├── services/      # Business logic (ACI orchestration, AI calls)
│   │   ├── schemas/       # Pydantic schemas
│   │   └── config.py      # Settings and Azure credentials
│   └── requirements.txt
├── scanner/               # Scanning engine
│   ├── Dockerfile         # Windows container image
│   ├── scripts/           # ZAP automation + exploit scripts
│   └── payloads/          # Crafted payload templates
├── ml/                    # ML pipeline
│   ├── train.py           # Anomaly detection training
│   └── pipeline.yml       # AML pipeline definition
├── infra/                 # Infrastructure as Code
│   └── azure/             # ARM templates or Bicep files
├── .github/workflows/     # GitHub Actions CI/CD
├── CLAUDE.md
└── README.md
```

## Development Guidelines
- All backend code is Python 3.11+ with type hints
- Use `async/await` throughout FastAPI handlers
- Container instances must be destroyed immediately after scan completion
- Never store credentials in code — use Azure Key Vault / environment variables
- All scan operations must be authorized and scoped to user-defined targets only
- Cosmos DB documents should include timestamps and scan correlation IDs
- Frontend uses functional React components with hooks

## Key Azure SDKs
```
azure-mgmt-containerinstance   # ACI provisioning
azure-cosmos                   # Cosmos DB access
azure-ai-inference             # AI Foundry calls
azure-identity                 # Authentication
python-owasp-zap-v2.4         # ZAP API
sqlalchemy                     # Azure SQL ORM
msal                           # Entra ID (frontend)
fastapi                        # Backend framework
uvicorn                        # ASGI server
```

## Ethical Use
This platform is for **authorized security testing only**. All targets must be explicitly approved. The platform is built as an academic project for bachelor's studies at HIT.
