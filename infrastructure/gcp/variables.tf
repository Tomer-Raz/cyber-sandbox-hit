variable "project_id" {
  description = "GCP project ID that holds every resource."
  type        = string
  default     = "cyber-sandbox-hit"
}

variable "region" {
  description = "Primary region for Cloud Run, Cloud SQL, Artifact Registry and Vertex AI."
  type        = string
  default     = "europe-west1"
}

variable "zone" {
  description = "Default zone (used by zonal resources only)."
  type        = string
  default     = "europe-west1-b"
}

variable "environment" {
  description = "Deployment environment, used in resource names and labels."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "stg", "prod"], var.environment)
    error_message = "environment must be one of: dev, stg, prod."
  }
}

variable "name_prefix" {
  description = "Prefix for every resource name."
  type        = string
  default     = "sandbox"
}

# ── Networking / cost ─────────────────────────────────────────────────────────

variable "enable_private_networking" {
  description = <<-EOT
    Create a VPC, Private Service Access and a Cloud NAT so Cloud SQL is private
    and every scan egresses from one fixed IP.

    Costs roughly $45/month idle (NAT gateway + reserved IP) and is the single
    most expensive thing in this stack, so it is off by default. With it off,
    Cloud SQL is reached over the Cloud SQL connector (TLS + IAM, no authorized
    networks) and Cloud Run uses free default egress.
  EOT
  type        = bool
  default     = false
}

variable "max_backend_instances" {
  description = "Cloud Run backend instance ceiling — caps worst-case spend."
  type        = number
  default     = 3
}

variable "max_frontend_instances" {
  description = "Cloud Run frontend instance ceiling."
  type        = number
  default     = 2
}

# ── Data layer ────────────────────────────────────────────────────────────────

variable "firestore_location" {
  description = "Firestore (Native mode) multi-region or region. eur3 = Europe multi-region."
  type        = string
  default     = "eur3"
}

variable "db_tier" {
  description = "Cloud SQL machine tier. db-f1-micro is the cheapest, fine for an academic project."
  type        = string
  default     = "db-f1-micro"
}

variable "db_version" {
  description = "Cloud SQL PostgreSQL version."
  type        = string
  default     = "POSTGRES_15"
}

variable "db_name" {
  description = "Application database name."
  type        = string
  default     = "sandbox"
}

variable "db_user" {
  description = "Application database user."
  type        = string
  default     = "sandbox_app"
}

variable "db_deletion_protection" {
  description = "Block `terraform destroy` from dropping the Cloud SQL instance."
  type        = bool
  default     = false
}

variable "db_disk_size" {
  description = "Cloud SQL disk in GB. 10 is the minimum billable size."
  type        = number
  default     = 10
}

variable "db_disk_type" {
  description = "PD_HDD is ~4x cheaper per GB than PD_SSD and plenty for this dataset."
  type        = string
  default     = "PD_HDD"

  validation {
    condition     = contains(["PD_HDD", "PD_SSD"], var.db_disk_type)
    error_message = "db_disk_type must be PD_HDD or PD_SSD."
  }
}

variable "db_activation_policy" {
  description = <<-EOT
    ALWAYS = instance runs (billed per hour, ~$8/month at db-f1-micro).
    NEVER  = instance stays stopped; you pay ~$1/month for the disk only and
             start it from the console when you need it. Cheapest option while
             you are still building the backend.
  EOT
  type        = string
  default     = "ALWAYS"

  validation {
    condition     = contains(["ALWAYS", "NEVER"], var.db_activation_policy)
    error_message = "db_activation_policy must be ALWAYS or NEVER."
  }
}

variable "db_enable_backups" {
  description = "Automated daily backups. First few GB are free; keep on."
  type        = bool
  default     = true
}

variable "db_enable_pitr" {
  description = "Point-in-time recovery. Retains write-ahead logs, billed per GB. Off in dev."
  type        = bool
  default     = false
}

# ── Runtime images ────────────────────────────────────────────────────────────
# Placeholders on first apply; GitHub Actions pushes the real images afterwards
# and Terraform ignores later image drift (see lifecycle blocks in cloud_run.tf).

variable "backend_image" {
  description = "Container image for the FastAPI backend service."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "frontend_image" {
  description = "Container image for the React SPA static service."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "scanner_image" {
  description = "Container image for the OWASP ZAP + exploit scripts scan job."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/job"
}

# ── Scan job sizing ───────────────────────────────────────────────────────────

# Jobs are billed per second of task runtime only — nothing accrues between
# scans. Sized to the minimum ZAP runs comfortably on.

variable "scanner_cpu" {
  description = "vCPU for a single scan job task."
  type        = string
  default     = "1"
}

variable "scanner_memory" {
  description = "Memory for a single scan job task. ZAP headless needs ~2Gi."
  type        = string
  default     = "2Gi"
}

variable "scanner_timeout" {
  description = "Hard ceiling on one scan task — also the cap on what one scan can cost."
  type        = string
  default     = "1800s"
}

# ── AI ────────────────────────────────────────────────────────────────────────

variable "vertex_location" {
  description = "Vertex AI location for Gemini calls and pipeline runs."
  type        = string
  default     = "europe-west1"
}

variable "vertex_model" {
  description = "Gemini model used for CVE template matching."
  type        = string
  default     = "gemini-2.0-flash"
}

# ── Auth / CI ─────────────────────────────────────────────────────────────────

variable "google_oauth_client_id" {
  description = "Google OAuth 2.0 Web client ID. Created by hand in the console (no Terraform resource exists for it); backend uses it as the ID-token audience."
  type        = string
  default     = ""
}

variable "github_owner" {
  description = "GitHub org/user that owns the repo allowed to deploy."
  type        = string
  default     = "Tomer-Raz"
}

variable "github_repo" {
  description = "GitHub repository name allowed to deploy via Workload Identity Federation."
  type        = string
  default     = "cyber-sandbox-hit"
}

# ── Observability ─────────────────────────────────────────────────────────────

variable "billing_account_id" {
  description = "Billing account ID (e.g. 0116FD-C97AD8-862324). Set it to create a budget alert; empty skips it. Requires roles/billing.admin."
  type        = string
  default     = ""
}

variable "monthly_budget" {
  description = "Monthly budget threshold that triggers the alert emails."
  type        = number
  default     = 30
}

variable "budget_currency" {
  description = "Currency of the billing account (ILS for an Israeli account)."
  type        = string
  default     = "ILS"
}

variable "log_retention_days" {
  description = "Retention for the dedicated security log bucket."
  type        = number
  default     = 30
}

variable "alert_email" {
  description = "Email that receives Cloud Monitoring alerts. Empty string disables the channel and the alert policies."
  type        = string
  default     = ""
}

variable "enable_chronicle_export" {
  description = <<-EOT
    Create a BigQuery dataset + log sink for Chronicle / BigQuery threat hunting.
    Off by default: it duplicates log ingestion into a second destination, and
    BigQuery storage is only free for the first 10 GiB/month.
  EOT
  type        = bool
  default     = false
}
