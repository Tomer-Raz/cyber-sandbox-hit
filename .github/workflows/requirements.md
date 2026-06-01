# CI/CD Tasks (GitHub Actions)

List of workflows to build in `.github/workflows/`.

## Workflow Files Needed
| File | Purpose |
|------|---------|
| `frontend.yml` | Build + deploy React SPA |
| `backend.yml` | Test + build + deploy FastAPI |
| `scanner.yml` | Build + push scanner Docker image |
| `infra.yml` | Deploy Azure infra (Bicep/Terraform) |
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

**Secrets**
- `AZURE_CREDENTIALS` (OIDC)
- `AZURE_SUBSCRIPTION_ID`, `AZURE_RG`, `AZURE_APP_NAME`
- `VITE_MSAL_CLIENT_ID`, `VITE_MSAL_TENANT_ID`, `VITE_MSAL_REDIRECT_URI`
- `VITE_API_BASE_URL`

**Deploy**
- `azure/static-web-apps-deploy@v1` or `azure/webapps-deploy@v3`
- GitHub Environments `dev` + `prod` (prod needs reviewer)

---

## 2. Backend Pipeline (`backend.yml`)

**Triggers**
- Push to `main` (deploy)
- PR to `main` (test only)
- Manual dispatch

**Jobs**
- `quality`: ruff + black + mypy + pytest (80% coverage)
- `build-and-push`: Docker buildx → push to ACR (tags: `:sha`, `:latest`)
- `deploy`:
  - Run Alembic migrations
  - `az webapp config container set` to new image
  - `az webapp restart`
  - Health check `/healthz` (5 retries, 10s)
  - Rollback to `:previous` if unhealthy

**Caching**
- `setup-python` with `cache: pip`

**Secrets (OIDC)**
- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- `ACR_NAME`, `APP_SERVICE_NAME`, `RESOURCE_GROUP`
- DB creds from Key Vault (not GitHub)

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
- `build-and-push` (windows-latest):
  - Azure OIDC login
  - `az acr login`
  - Build Windows Docker image
  - Push to ACR
- `trivy-scan` (ubuntu): Trivy on pushed image, fail on HIGH/CRITICAL, upload SARIF

**Tagging**
- `:latest` — last successful main
- `:vX.Y.Z` — git tag
- `:sha-<short>` — every build
- `:pr-<num>` — PR builds (not prod)

**Secrets (OIDC)**
- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- Federated cred with `AcrPush` role

---

## 4. Infra Pipeline (`infra.yml`)

**Triggers**
- PR on `main` → lint + plan preview
- Push to `main` → apply to dev
- Manual dispatch → choose env

**Jobs**
- `lint`: `az bicep build` + `bicep lint` (or tflint + terraform fmt)
- `plan`: `az deployment group what-if` (post as PR comment)
- `approve`: GitHub Environment `prod` with required reviewers
- `apply`: deploy RG, Key Vault, App Service, ACR, SQL, Cosmos, AI Foundry, ML, Log Analytics, Sentinel

**Environments**
- `dev` — auto-deploy on merge
- `prod` — manual dispatch + reviewer
- Param files: `main.dev.bicepparam`, `main.prod.bicepparam`

**Secrets (OIDC)**
- Per env: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- App secrets in Key Vault

---

## 5. Security Pipeline (`security.yml` + split files)

**Workflows**
- `secrets.yml` — Gitleaks on every push/PR; weekly full-history scan
- `codeql.yml` — CodeQL SAST (Python + JS); PR + nightly
- `deps.yml`:
  - `npm audit --audit-level=high` (frontend)
  - `pip-audit -r requirements.txt` (backend)
  - Dependabot (`.github/dependabot.yml`): weekly pip/npm/docker/actions
- `container.yml` — Trivy on ACR images (HIGH/CRITICAL fail)
- `iac.yml` — Checkov on Bicep + Dockerfiles

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
- Use OIDC federated creds — no long-lived secrets
- GitHub Environments for `dev` / `prod` separation
- Secrets in Key Vault, referenced at runtime

---

## Build Order
1. OIDC federated credentials in Entra ID
2. GitHub Environments (`dev`, `prod`) + secrets
3. Security pipeline (catch issues early)
4. Infra pipeline (deploy Azure resources)
5. Backend pipeline
6. Scanner pipeline
7. Frontend pipeline
8. Branch protection rules
