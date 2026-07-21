output "backend_url" {
  description = "FastAPI service URL — set as VITE_API_BASE_URL in the frontend build."
  value       = google_cloud_run_v2_service.backend.uri
}

output "frontend_url" {
  description = "React SPA URL — add to the OAuth client's authorized JavaScript origins."
  value       = google_cloud_run_v2_service.frontend.uri
}

output "artifact_registry_repo" {
  description = "Docker repo path for image pushes."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "scanner_job_name" {
  description = "Cloud Run Job the backend starts executions of."
  value       = google_cloud_run_v2_job.scanner.name
}

output "sql_connection_name" {
  description = "Cloud SQL instance connection name for cloud-sql-python-connector."
  value       = google_sql_database_instance.main.connection_name
}

output "sql_private_ip" {
  description = "Private IP of the PostgreSQL instance."
  value       = google_sql_database_instance.main.private_ip_address
}

output "nat_egress_ip" {
  description = "Single outbound IP for all scans — whitelist this on approved targets. Null unless enable_private_networking = true."
  value       = one(google_compute_address.nat_ip[*].address)
}

output "backend_service_account" {
  value       = google_service_account.backend.email
  description = "Runtime identity of the FastAPI service."
}

output "scanner_service_account" {
  value       = google_service_account.scanner.email
  description = "Runtime identity of scan jobs."
}

# ── GitHub Actions secrets ───────────────────────────────────────────────────

output "gh_workload_identity_provider" {
  description = "Value for the GCP_WORKLOAD_IDENTITY_PROVIDER repo secret."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "gh_service_account" {
  description = "Value for the GCP_SERVICE_ACCOUNT repo secret."
  value       = google_service_account.deployer.email
}

output "secret_ids" {
  description = "Secret Manager secret IDs used by the backend."
  value = {
    db_password         = google_secret_manager_secret.db_password.secret_id
    jwt_signing_key     = google_secret_manager_secret.jwt_signing_key.secret_id
    oauth_client_secret = google_secret_manager_secret.oauth_client_secret.secret_id
  }
}
