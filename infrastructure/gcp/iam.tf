# One service account per workload, least privilege each.

resource "google_service_account" "backend" {
  account_id   = "${local.prefix}-backend"
  display_name = "FastAPI backend (Cloud Run)"

  depends_on = [google_project_service.services]
}

resource "google_service_account" "scanner" {
  account_id   = "${local.prefix}-scanner"
  display_name = "ZAP scan job (Cloud Run Jobs)"

  depends_on = [google_project_service.services]
}

resource "google_service_account" "frontend" {
  account_id   = "${local.prefix}-frontend"
  display_name = "React SPA static container (Cloud Run)"

  depends_on = [google_project_service.services]
}

resource "google_service_account" "deployer" {
  account_id   = "${local.prefix}-gh-deployer"
  display_name = "GitHub Actions deployer"

  depends_on = [google_project_service.services]
}

# ── Backend: orchestrates scans, reads/writes data, calls Vertex AI ───────────

resource "google_project_iam_member" "backend" {
  for_each = toset([
    "roles/run.developer",   # create + run scan jobs
    "roles/cloudsql.client", # Cloud SQL connector
    "roles/datastore.user",  # Firestore read/write
    "roles/aiplatform.user", # Gemini + pipelines
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent",
    "roles/artifactregistry.reader", # pull scanner image metadata
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# Backend launches jobs that run as the scanner SA, so it must be able to
# impersonate it at job-creation time.
resource "google_service_account_iam_member" "backend_uses_scanner_sa" {
  service_account_id = google_service_account.scanner.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.backend.email}"
}

# ── Scanner: writes results, nothing else ────────────────────────────────────

resource "google_project_iam_member" "scanner" {
  for_each = toset([
    "roles/datastore.user",
    "roles/aiplatform.user",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.scanner.email}"
}

# ── Frontend: serves static files, needs no GCP data access ──────────────────

resource "google_project_iam_member" "frontend" {
  for_each = toset([
    "roles/logging.logWriter",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.frontend.email}"
}

# ── GitHub Actions deployer: push images, deploy revisions ───────────────────

resource "google_project_iam_member" "deployer" {
  for_each = toset([
    "roles/run.admin",
    "roles/artifactregistry.writer",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Deploying a revision means setting its runtime SA — that needs actAs.
resource "google_service_account_iam_member" "deployer_acts_as" {
  for_each = {
    backend  = google_service_account.backend.name
    frontend = google_service_account.frontend.name
    scanner  = google_service_account.scanner.name
  }

  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}
