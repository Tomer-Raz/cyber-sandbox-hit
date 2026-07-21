# Every API the platform touches. Enabled first; everything else depends on it.
resource "google_project_service" "services" {
  for_each = toset([
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "sqladmin.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com",
    "firestore.googleapis.com",
    "aiplatform.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudtrace.googleapis.com",
    "bigquery.googleapis.com",
    "chronicle.googleapis.com",
    "billingbudgets.googleapis.com",
  ])

  project = var.project_id
  service = each.value

  # Keep APIs on when the stack is destroyed — other things in the project may
  # still need them, and re-enabling is slow.
  disable_on_destroy         = false
  disable_dependent_services = false
}
