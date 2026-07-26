# GCP Infrastructure (Terraform)

Terraform for the Sandbox Playground Cyber Platform. Covers every item in
[`../requirements.md`](../requirements.md) that has a Terraform resource.

## Layout

| File | What it creates |
|------|-----------------|
| `apis.tf` | All required Google APIs |
| `network.tf` | VPC, subnet, Private Service Access, Cloud NAT (single scan egress IP) |
| `iam.tf` | Service accounts for backend / scanner / frontend / CI, least-privilege roles |
| `secrets.tf` | Secret Manager: DB password, JWT signing key, OAuth client secret |
| `artifact_registry.tf` | Docker repo + cleanup policies |
| `sql.tf` | Cloud SQL PostgreSQL (private IP, IAM auth, backups, PITR) |
| `firestore.tf` | Firestore Native DB + composite indexes for scan/audit queries |
| `cloud_run.tf` | Backend (FastAPI) + frontend (SPA) Cloud Run services |
| `cloud_run_job.tf` | Scanner job template (ZAP + exploit scripts) |
| `workload_identity.tf` | GitHub Actions OIDC federation (no JSON keys) |
| `logging.tf` | Security log bucket + sinks, BigQuery export for hunting |
| `monitoring.tf` | Email channel + alerts on backend 5xx and scan-job failures |

## Not managed by Terraform

- **Google OAuth client / consent screen** — no Terraform resource exists.
  Create in the console, then set `google_oauth_client_id` and push the client
  secret into `sandbox-dev-oauth-client-secret`.
- **Chronicle (SecOps) feeds** — configured in the SecOps console. The
  BigQuery dataset and log sinks here provide the data surface.
- **Vertex AI pipelines** — pipeline definitions live in `ml/`; the API and IAM
  are enabled here.

## Usage

```bash
# One-time: credentials for Terraform
gcloud auth application-default login
gcloud auth application-default set-quota-project cyber-sandbox-hit

cp terraform.tfvars.example terraform.tfvars   # then edit
terraform init
terraform fmt -recursive
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

Billing must be linked to the project before `apply` — Cloud Run, Cloud SQL and
Artifact Registry all require it.

### Remote state (recommended before working as a group)

```bash
gcloud storage buckets create gs://cyber-sandbox-hit-tfstate \
  --location=europe-west1 --uniform-bucket-level-access
gcloud storage buckets update gs://cyber-sandbox-hit-tfstate --versioning
```

Then uncomment the `backend "gcs"` block in `versions.tf` and run
`terraform init -migrate-state`.

## After apply

1. Wire the GitHub repo secrets from the outputs:
   - `GCP_WORKLOAD_IDENTITY_PROVIDER` ← `gh_workload_identity_provider`
   - `GCP_SERVICE_ACCOUNT` ← `gh_service_account`
   - `GCP_PROJECT_ID` ← `cyber-sandbox-hit`
   - `VITE_API_BASE_URL` ← `backend_url`
   - repo variables: `GAR_LOCATION`, `GAR_REPO`, `GCP_REGION`, `CLOUD_RUN_SERVICE`,
     `BACKEND_CLOUD_RUN_SERVICE`, `SCANNER_CLOUD_RUN_JOB` (= `scanner_job_name`
     output, `sandbox-dev-scanner` by default)
2. Add `frontend_url` to the OAuth client's authorized JavaScript origins.
3. Whitelist `nat_egress_ip` on any approved scan target — every scan leaves
   from that single IP.

## Cost

Defaults target the smallest possible bill on a $300 free-trial account.

| Resource | Default | Idle cost |
|---|---|---|
| Cloud Run (backend, frontend) | scale to zero, capped instances | $0 — 2M req/mo free |
| Cloud Run Job (scanner) | 1 vCPU / 2Gi, 30 min cap | $0 idle, per-second while scanning |
| Firestore | Native, no PITR | $0 under 1 GiB + 50k reads/day |
| Artifact Registry | keep 3 versions, purge untagged | $0 under 0.5 GB |
| Secret Manager | 3 secrets | $0 under 6 versions |
| Cloud Logging | 30-day retention | $0 under 50 GiB/mo |
| Cloud Monitoring / Trace | alerts only | $0 |
| **Cloud SQL** | db-f1-micro, PD_HDD 10GB, zonal, no PITR | **~$8/mo — the only always-on charge** |
| VPC + Cloud NAT | **disabled** | $0 (would be ~$45/mo) |
| BigQuery log export | **disabled** | $0 |

Levers, cheapest first:

- `db_activation_policy = "NEVER"` — Cloud SQL stays stopped, you pay storage
  only (~$1/mo) and start it from the console when you need the DB. Best while
  the backend is still being written.
- `enable_private_networking = true` — turns on the VPC, private Cloud SQL IP
  and the single auditable NAT egress IP. Correct for a real deployment,
  ~$45/mo idle. Off by default.
- `enable_chronicle_export = true` — adds the BigQuery hunting dataset.
- Vertex AI (Gemini) is pay-per-token with no free tier and draws from the
  credit. Cost tracks scan volume, not idle time.

Set `billing_account_id` + `alert_email` to get budget alerts at 50/90/100% and
on forecast overrun. Alerts notify — they do **not** stop spend.

### Free trial

While the account is on the $300 trial, usage draws from the credit and the
card is not charged; when credit or the 90 days run out, Google suspends
resources instead of billing. That protection ends the moment the account is
manually upgraded to paid.

## Ethical use

Scan jobs must only ever run against targets the project owner has authorized.
The NAT egress IP exists so every scan is attributable.
