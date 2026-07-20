# CI/CD Tasks (GitHub Actions)

List of workflows to build in `.github/workflows/`.

## Workflow Files Needed
| File | Purpose |
|------|---------|
| `frontend.yml` | Build + deploy React SPA |
| `backend.yml` | Test + build + deploy FastAPI |
| `scanner.yml` | Build + push scanner Docker image |
| `infra.yml` | Deploy GCP infra (Terraform) |
| `security.yml` | Security scans (SAST, secrets, deps) |

---

## 1. Frontend Pipeline (`frontend.yml`)

**Triggers**
- Push to `main` → deploy to dev
- Tag `v*.*.*` → deploy to prod
- PR to `main` → lint/test/build only
- Manual dispatch

**Jobs**
- `lint`: ESLint + `tsc --noEmit`
- `test`: Vitest with coverage
- `build`: `npm run build` (inject `VITE_*` env vars)
- `deploy`: per env (dev/prod)

**Caching**
- `setup-node@v4` with `cache: 'npm'`
- Vite cache `node_modules/.vite`
- Upload `dist/` as artifact

**Secrets (OIDC / Workload Identity Federation)**
- `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`
- `GAR_LOCATION`, `CLOUD_RUN_SERVICE`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_API_BASE_URL`

**Deploy**
- Build static `dist/`, containerize (nginx), push to Artifact Registry, then
  `google-github-actions/deploy-cloudrun@v2` (static SPA service)
- GitHub Environments `dev` + `prod` (prod needs reviewer)

---

## 2. Backend Pipeline (`backend.yml`)

**Triggers**
- Push to `main` (deploy)
- PR to `main` (test only)
- Manual dispatch

**Jobs**
- `quality`: ruff + black + mypy + pytest (80% coverage)
- `build-and-push`: Docker buildx → push to Artifact Registry (tags: `:sha`, `:latest`)
- `deploy`:
  - Run Alembic migrations
  - `gcloud run deploy` with the new image
  - Route traffic to the new revision
  - Health check `/healthz` (5 retries, 10s)
  - Roll back to the previous revision if unhealthy

**Caching**
- `setup-python` with `cache: pip`

**Secrets (OIDC / Workload Identity Federation)**
- `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`
- `GAR_LOCATION`, `GAR_REPO`, `CLOUD_RUN_SERVICE`, `GCP_REGION`
- DB creds from Secret Manager (not GitHub)

---

## 3. Scanner Pipeline (`scanner.yml`)

**Triggers**
- Push to `main` with path filter `scanner/**`
- PR with same filter
- Tag `v*.*.*` → release build
- Manual dispatch

**Jobs**
- `lint` (ubuntu): ruff + black on Python scripts
- `test` (ubuntu): pytest on payloads
- `build-and-push` (ubuntu-latest):
  - `google-github-actions/auth` (Workload Identity Federation)
  - `gcloud auth configure-docker <region>-docker.pkg.dev`
  - Build Linux Docker image
  - Push to Artifact Registry
- `trivy-scan` (ubuntu): Trivy on pushed image, fail on HIGH/CRITICAL, upload SARIF

**Tagging**
- `:latest` — last successful main
- `:vX.Y.Z` — git tag
- `:sha-<short>` — every build
- `:pr-<num>` — PR builds (not prod)

**Secrets (OIDC / Workload Identity Federation)**
- `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`
- Service account with `Artifact Registry Writer` role

---

## 4. Infra Pipeline (`infra.yml`)

**Triggers**
- PR on `main` → lint + plan preview
- Push to `main` → apply to dev
- Manual dispatch → choose env

**Jobs**
- `lint`: `terraform fmt -check` + `tflint` + `terraform validate`
- `plan`: `terraform plan` (post as PR comment)
- `approve`: GitHub Environment `prod` with required reviewers
- `apply`: `terraform apply` — Secret Manager, Cloud Run, Artifact Registry, Cloud SQL, Firestore, Vertex AI, Cloud Logging, Chronicle

**Environments**
- `dev` — auto-deploy on merge
- `prod` — manual dispatch + reviewer
- Var files: `dev.tfvars`, `prod.tfvars`

**Secrets (OIDC / Workload Identity Federation)**
- Per env: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`
- App secrets in Secret Manager

---

## 5. Security Pipeline (`security.yml` + split files)

**Workflows**
- `secrets.yml` — Gitleaks on every push/PR; weekly full-history scan
- `codeql.yml` — CodeQL SAST (Python + JS); PR + nightly
- `deps.yml`:
  - `npm audit --audit-level=high` (frontend)
  - `pip-audit -r requirements.txt` (backend)
  - Dependabot (`.github/dependabot.yml`): weekly pip/npm/docker/actions
- `container.yml` — Trivy on Artifact Registry images (HIGH/CRITICAL fail)
- `iac.yml` — Checkov on Terraform + Dockerfiles

**Triggers**
- PR → all scans (blocking)
- Push to main → all + push to Security tab
- Nightly cron → CodeQL, Trivy, Gitleaks history

---

## Branch Protection (`main`)
- Require PR + 1 reviewer (CODEOWNERS)
- Required checks: gitleaks, codeql-python, codeql-js, npm-audit, pip-audit, trivy, checkov, lint, test
- Dismiss stale reviews on new commits
- Require signed commits + linear history
- Block force-push and direct push (admins included)
- Require conversation resolution before merge

## Global Notes
- Pin all actions to SHA (not floating tags)
- Use Workload Identity Federation — no long-lived service-account keys
- GitHub Environments for `dev` / `prod` separation
- Secrets in Secret Manager, referenced at runtime

---

## Build Order
1. Workload Identity Federation in GCP (pool + service account)
2. GitHub Environments (`dev`, `prod`) + secrets
3. Security pipeline (catch issues early)
4. Infra pipeline (deploy GCP resources)
5. Backend pipeline
6. Scanner pipeline
7. Frontend pipeline
8. Branch protection rules
