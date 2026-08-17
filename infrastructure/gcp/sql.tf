resource "google_sql_database_instance" "main" {
  name             = "${local.prefix}-pg"
  database_version = var.db_version
  region           = var.region

  deletion_protection = var.db_deletion_protection

  settings {
    tier = var.db_tier

    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"

    disk_size       = var.db_disk_size
    disk_type       = var.db_disk_type
    disk_autoresize = false # a runaway autoresize can only ever cost money

    # Never keeps the instance stopped 
    activation_policy = var.db_activation_policy

    ip_configuration {
      # Public IP by default, but with zero authorized networks: the only way in
      # is the Cloud SQL connector (TLS + IAM), which the backend already uses.
      ipv4_enabled                                  = !var.enable_private_networking
      private_network                               = var.enable_private_networking ? google_compute_network.main[0].id : null
      enable_private_path_for_google_cloud_services = var.enable_private_networking
      ssl_mode                                      = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled    = var.db_enable_backups
      start_time = "03:00"

      # PITR keeps write-ahead logs around and is billed per GB — off in dev.
      point_in_time_recovery_enabled = var.db_enable_pitr
      transaction_log_retention_days = var.db_enable_pitr ? 3 : null

      backup_retention_settings {
        retained_backups = 3
        retention_unit   = "COUNT"
      }
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }

    insights_config {
      # Query Insights is free, but keep sampling minimal.
      query_insights_enabled  = true
      record_application_tags = false
    }

    maintenance_window {
      day  = 7 # Sunday
      hour = 4
    }

    user_labels = local.labels
  }

  depends_on = [
    google_service_networking_connection.private_vpc,
    google_project_service.services,
  ]
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = random_password.db.result

  lifecycle {
    ignore_changes = [password]
  }
}

# IAM-based login for the backend SA — no password on the hot path.
resource "google_sql_user" "backend_iam" {
  name     = trimsuffix(google_service_account.backend.email, ".gserviceaccount.com")
  instance = google_sql_database_instance.main.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}
