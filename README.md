# Sandbox Playground Cyber Platform

A cloud-native, AI-driven cybersecurity platform for automated penetration testing, built on Google Cloud Platform.

> **Architecture:** full system & sequence diagrams in [`architecture.md`](architecture.md) (Mermaid, renders on GitHub); editable source in [`project_architecture.drawio`](project_architecture.drawio).

## Overview

The Sandbox Playground Cyber Platform enables registered users to define target servers and orchestrate automated penetration testing through an intuitive web interface. The system dynamically provisions ephemeral Linux containers for scanning, leverages Vertex AI for intelligent vulnerability matching, and employs Vertex AI pipelines for anomaly detection.

> **Academic Project** — Developed as part of bachelor's studies at HIT (Holon Institute of Technology).

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────────┐
│  React SPA  │────▶│  FastAPI     │────▶│  Cloud Run Jobs         │
│  (Google    │◀────│  (Cloud Run) │◀────│  (ephemeral Linux)      │
│   OAuth)    │     └──────┬───────┘     │  ┌───────┐ ┌─────────┐ │
└─────────────┘            │             │  │OWASP  │ │ Exploit │ │
                    ┌──────┴───────┐     │  │ ZAP   │ │ Scripts │ │
                    │  Cloud SQL   │     │  └───────┘ └─────────┘ │
                    │  (Users &    │     └─────────────────────────┘
                    │   Configs)   │                │
                    └──────────────┘                ▼
                                        ┌─────────────────────┐
                    ┌───────────────┐   │  Vertex AI          │
                    │  Firestore    │◀──│  (CVE Matching)     │
                    │  (Logs &      │   └─────────────────────┘
                    │   Telemetry)  │
                    └───────┬───────┘   ┌─────────────────────┐
                            │           │  Vertex AI          │
                            └──────────▶│  (Anomaly Detection)│
                                        └─────────────────────┘
                    ┌───────────────┐
                    │  Chronicle    │◀── Firestore + Cloud Identity logs
                    │  (SecOps SIEM)│
                    └───────────────┘
```

## Flow Steps

1. Authenticate via Google OAuth
2. Send scan request (REST)
3. Save config to Cloud SQL
4. Provision Cloud Run Job
5. DAST scan & exploit target
6. Send results to Vertex AI
7. Trigger exploit validation
8. Write logs to Firestore
9. Feed ML anomaly pipeline
10. Ingest events to Chronicle
11. Return reports to dashboard

## How It Works

1. **Authenticate** — Log in via Google OAuth
2. **Configure** — Define target IP/domain and scan parameters
3. **Scan** — FastAPI provisions an ephemeral Cloud Run Job with OWASP ZAP
4. **Analyze** — ZAP results are sent to Vertex AI for CVE template matching
5. **Exploit** — Matched vulnerabilities are validated with custom Python payloads
6. **Report** — Logs flow to Firestore; Vertex AI detects anomalies; Chronicle provides SIEM

Containers are destroyed immediately after each scan to minimize compute costs.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Google OAuth 2.0 |
| Backend | Python, FastAPI, SQLAlchemy |
| Scanning | OWASP ZAP, Custom Python exploits |
| Containers | Cloud Run Jobs, Artifact Registry |
| AI/ML | Vertex AI (Gemini LLM), Vertex AI Pipelines (Scikit-Learn/PyTorch) |
| Databases | Cloud SQL for PostgreSQL, Firestore (Serverless) |
| Monitoring | Chronicle (Google Security Operations) |
| CI/CD | GitHub Actions |

## Project Structure

```
cyber-sandbox-hit/
├── frontend/              # React SPA
├── backend/               # FastAPI application
├── scanner/               # OWASP ZAP container + exploit scripts
├── ml/                    # Vertex AI anomaly detection pipeline
├── infra/                 # GCP infrastructure (Terraform)
└── .github/workflows/     # GitHub Actions CI/CD
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A GCP project with the following APIs/services enabled:
  - Cloud Run & Artifact Registry
  - Cloud SQL for PostgreSQL
  - Firestore (Native mode)
  - Vertex AI
  - Chronicle / Google Security Operations
  - Cloud Identity (OAuth 2.0 client)
  - Secret Manager

### Setup

```bash
# Clone the repository
git clone https://github.com/<org>/cyber-sandbox-hit.git
cd cyber-sandbox-hit

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd ../frontend
npm install
npm run dev
```

### Environment Variables

Configure the following (use Secret Manager in production):

```
DATABASE_URL=
CLOUD_SQL_CONNECTION_NAME=
FIRESTORE_PROJECT_ID=
ARTIFACT_REGISTRY_REPO=
VERTEX_AI_LOCATION=
VERTEX_AI_MODEL=
GCP_PROJECT_ID=
GCP_REGION=
GOOGLE_OAUTH_CLIENT_ID=
```

## CI/CD

GitHub Actions automatically:
1. Build and test the FastAPI backend
2. Build the scanner Docker image (Linux)
3. Push the image to Artifact Registry
4. Deploy the backend to Cloud Run

## Ethical Use

This platform is designed for **authorized security testing only**. All scan targets must be explicitly approved. Unauthorized use against systems you do not own or have permission to test is prohibited.

## Team

Developed by students at HIT (Holon Institute of Technology) as a bachelor's degree project.

## License

This project is for academic purposes.
