# Sandbox Playground Cyber Platform

A cloud-native, AI-assisted platform for automated penetration testing, built on Google Cloud Platform.

## Overview

Registered users log in with Google, add a target, and launch a scan. The backend spins up a short-lived Cloud Run Job that runs OWASP ZAP against the target, sends the findings to Vertex AI (Gemini) for CVE/CVSS enrichment, re-confirms a sample of findings with safe follow-up requests, and flags unusual scans with a statistical anomaly check. Results are viewable in the dashboard and exportable as signed JSON or PDF reports.

> **Academic Project** — Developed as part of bachelor's studies at HIT

## How It Works

1. **Sign in** — Google OAuth; the backend verifies the Google ID token on every request
2. **Add a target** — URL is validated (auto-completes `http(s)://`, blocked from pointing at internal/private addresses)
3. **Scan** — A Cloud Run Job runs OWASP ZAP (spider + passive/active scan) against the target, then shuts down
4. **Enrich** — Findings are sent to Vertex AI (Gemini 2.5 Flash) for CVE IDs, CVSS scores, and remediation summaries
5. **Re-confirm** — Flagged findings get a safe follow-up request to check the vulnerable evidence is still present; sensitive payloads are encrypted (AES-256-GCM) at rest
6. **Detect anomalies** — Each scan's findings count, risk score, and duration are compared (z-score) against that target's scan history to flag outliers
7. **Report** — View results in the dashboard, or export a cryptographically signed JSON/PDF report

## Features

- **Google OAuth login** — no local passwords
- **Target management** — add/remove scan targets with SSRF-safe URL validation
- **Scan dashboard** — live status, findings summary, 7-day trend, severity breakdown
- **AI-enriched findings** — CVE/CVSS matching and remediation guidance via Vertex AI
- **Anomaly detection** — statistical (z-score) flagging of unusual scans, no ML pipeline required
- **Signed report export** — JSON and PDF, both signed so tampering can be detected
- **Admin panel** — view/manage all users and scans, block/unblock users, per-user activity history
- **Dark / light / system theme**
- **Rate limiting** — per-user/IP request throttling on the API

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────────┐
│  React SPA  │────▶│  FastAPI     │────▶│  Cloud Run Job          │
│  (Google    │◀────│  (Cloud Run) │◀────│  (ephemeral, OWASP ZAP) │
│   OAuth)    │     └──────┬───────┘     └────────────┬────────────┘
└─────────────┘            │                           │
                    ┌──────┴───────┐                   ▼
                    │  Cloud SQL   │        ┌─────────────────────┐
                    │  (users,     │        │  Vertex AI          │
                    │   targets,   │        │  (Gemini – CVE/CVSS │
                    │   scans)     │        │   enrichment)       │
                    └──────────────┘        └─────────────────────┘
                    ┌──────────────┐
                    │  Firestore   │◀── scan logs, AI results,
                    │              │    exploit checks, audit log
                    └──────────────┘
```

Anomaly detection and PDF/JSON report signing run inside the FastAPI backend — no separate ML service is involved.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Ant Design, Recharts, Google OAuth 2.0 |
| Backend | Python, FastAPI, SQLAlchemy (async), slowapi (rate limiting) |
| Scanning | OWASP ZAP, run as a Cloud Run Job |
| AI | Vertex AI (Gemini 2.5 Flash) for CVE/CVSS enrichment |
| Databases | Cloud SQL for PostgreSQL, Firestore |
| Reports | fpdf2 (PDF), RSA-signed JSON/PDF exports |
| Security | AES-256-GCM (evidence encryption), Trivy, Gitleaks, Checkov (CI scanning) |
| CI/CD | GitHub Actions |

## Project Structure

```
cyber-sandbox-hit/
├── frontend/                  # React SPA (dashboard, scans, reports, admin)
├── backend/                   # FastAPI app + scanner worker (Dockerfile.scanner)
├── infrastructure/gcp/        # GCP infrastructure (Terraform)
└── .github/workflows/         # CI/CD: deploy backend/frontend/scanner, security scans
```

## CI/CD

GitHub Actions runs on every push/PR:
- **deploy-backend / deploy-frontend / deploy-scanner** — test, build Docker images, push to Artifact Registry, deploy to Cloud Run / Cloud Run Jobs
- **security** — Gitleaks (secret scanning), Checkov (Terraform/Dockerfile scanning), Trivy (filesystem vulnerability scanning)

## Ethical Use

This platform is designed for **authorized security testing only**. All scan targets must be explicitly approved.

## License

This project is for academic purposes.
