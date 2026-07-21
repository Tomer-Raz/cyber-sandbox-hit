resource "google_firestore_database" "main" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  concurrency_mode            = "OPTIMISTIC"
  app_engine_integration_mode = "DISABLED"

  # PITR is billed per GB of retained history — off to stay in the free tier.
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"
  delete_protection_state           = "DELETE_PROTECTION_DISABLED"

  depends_on = [google_project_service.services]
}

# Scan logs are always read as "one scan, newest first".
resource "google_firestore_index" "scan_logs_by_scan" {
  project    = var.project_id
  database   = google_firestore_database.main.name
  collection = "scan_logs"

  fields {
    field_path = "scan_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "timestamp"
    order      = "DESCENDING"
  }
}

resource "google_firestore_index" "ai_results_by_scan" {
  project    = var.project_id
  database   = google_firestore_database.main.name
  collection = "ai_results"

  fields {
    field_path = "scan_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "severity"
    order      = "DESCENDING"
  }
}

# Audit trail: per-user, newest first (feeds Chronicle and the anomaly pipeline).
resource "google_firestore_index" "audit_events_by_user" {
  project    = var.project_id
  database   = google_firestore_database.main.name
  collection = "audit_events"

  fields {
    field_path = "user_id"
    order      = "ASCENDING"
  }
  fields {
    field_path = "timestamp"
    order      = "DESCENDING"
  }
}
