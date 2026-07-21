# Dedicated bucket for platform + security logs, separate from _Default so
# retention can be tuned without touching everything else.

resource "google_logging_project_bucket_config" "security" {
  project        = var.project_id
  location       = "global"
  bucket_id      = "${local.prefix}-security-logs"
  description    = "Scan, auth and audit logs for the cyber sandbox platform"
  retention_days = var.log_retention_days

  depends_on = [google_project_service.services]
}

resource "google_logging_project_sink" "security" {
  name        = "${local.prefix}-security-sink"
  description = "Cloud Run + Cloud SQL + audit logs into the security bucket"
  destination = "logging.googleapis.com/${google_logging_project_bucket_config.security.id}"

  filter = <<-EOT
    resource.type = ("cloud_run_revision" OR "cloud_run_job" OR "cloudsql_database")
    OR logName : "cloudaudit.googleapis.com"
  EOT

  # Sink and bucket live in the same project; no extra grant needed.
  unique_writer_identity = true
}

# ── Chronicle / BigQuery hunting surface ─────────────────────────────────────
# Chronicle ingestion itself is configured in the SecOps console (no Terraform
# resource covers the feed). This dataset gives the same events a SQL surface.

resource "google_bigquery_dataset" "security_events" {
  count = var.enable_chronicle_export ? 1 : 0

  dataset_id                 = replace("${local.prefix}_security_events", "-", "_")
  friendly_name              = "Security events export"
  description                = "Cloud Run / audit logs exported for anomaly queries and Chronicle enrichment"
  location                   = "EU"
  delete_contents_on_destroy = true

  depends_on = [google_project_service.services]
}

resource "google_logging_project_sink" "bigquery" {
  count = var.enable_chronicle_export ? 1 : 0

  name        = "${local.prefix}-bq-sink"
  description = "Security events to BigQuery for anomaly detection queries"
  destination = "bigquery.googleapis.com/projects/${var.project_id}/datasets/${google_bigquery_dataset.security_events[0].dataset_id}"

  filter = <<-EOT
    resource.type = ("cloud_run_revision" OR "cloud_run_job")
    OR logName : "cloudaudit.googleapis.com/activity"
  EOT

  unique_writer_identity = true

  bigquery_options {
    use_partitioned_tables = true
  }
}

resource "google_bigquery_dataset_iam_member" "sink_writer" {
  count = var.enable_chronicle_export ? 1 : 0

  dataset_id = google_bigquery_dataset.security_events[0].dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = google_logging_project_sink.bigquery[0].writer_identity
}
