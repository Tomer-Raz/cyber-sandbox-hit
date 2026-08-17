# ── Backend: FastAPI ─────────────────────────────────────────────────────────
# Public at the network level; every route is guarded by Google ID-token
# verification in the app (Cloud Run IAM can't validate the SPA's OAuth
# audience, so authn stays in FastAPI).

resource "google_cloud_run_v2_service" "backend" {
  name     = "${local.prefix}-backend"
  location = var.region

  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account                  = google_service_account.backend.email
    timeout                          = "300s"
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 1
      max_instance_count = var.max_backend_instances
    }

    # Direct VPC egress: private Cloud SQL IP + NAT for outbound calls.
    # Only when private networking is enabled — see network.tf.
    dynamic "vpc_access" {
      for_each = var.enable_private_networking ? [1] : []
      content {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.main[0].id
          subnetwork = google_compute_subnetwork.main[0].id
        }
      }
    }

    containers {
      image = var.backend_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }
      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }
      env {
        name  = "DB_INSTANCE_CONNECTION_NAME"
        value = google_sql_database_instance.main.connection_name
      }
      env {
        name  = "DB_HOST"
        value = var.enable_private_networking ? google_sql_database_instance.main.private_ip_address : google_sql_database_instance.main.public_ip_address
      }
      env {
        name  = "DB_NAME"
        value = google_sql_database.app.name
      }
      env {
        name  = "DB_USER"
        value = google_sql_user.app.name
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = google_firestore_database.main.name
      }
      env {
        name  = "ARTIFACT_REGISTRY_REPO"
        value = google_artifact_registry_repository.docker.name
      }
      env {
        name  = "SCANNER_JOB_NAME"
        value = google_cloud_run_v2_job.scanner.name
      }
      env {
        name  = "VERTEX_LOCATION"
        value = var.vertex_location
      }
      env {
        name  = "VERTEX_MODEL"
        value = var.vertex_model
      }
      env {
        name  = "GOOGLE_OAUTH_CLIENT_ID"
        value = var.google_oauth_client_id
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = google_cloud_run_v2_service.frontend.uri
      }
      # The role to look up, not the people in it — the backend reads the
      # project IAM policy at runtime to find out who currently holds it.
      env {
        name  = "ADMIN_IAM_ROLE_ID"
        value = var.admin_iam_role_id
      }

      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "JWT_SIGNING_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_signing_key.secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 10
        tcp_socket {
          port = 8080
        }
      }

      liveness_probe {
        period_seconds    = 30
        failure_threshold = 3
        http_get {
          path = "/health"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].labels,
      client,
      client_version,
      # API echoes back a zeroed service-level scaling block we never set,
      # which would otherwise show as a permanent no-op diff.
      scaling,
      terraform_labels,
      effective_labels,
    ]
  }

  depends_on = [
    google_project_service.services,
    google_secret_manager_secret_iam_member.backend_db_password,
    google_secret_manager_secret_iam_member.backend_jwt_key,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "backend_public" {
  location = google_cloud_run_v2_service.backend.location
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Frontend: React SPA served by a static container ─────────────────────────

resource "google_cloud_run_v2_service" "frontend" {
  name     = "${local.prefix}-frontend"
  location = var.region

  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.frontend.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_frontend_instances
    }

    containers {
      image = var.frontend_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].labels,
      client,
      client_version,
      # API echoes back a zeroed service-level scaling block we never set,
      # which would otherwise show as a permanent no-op diff.
      scaling,
      terraform_labels,
      effective_labels,
    ]
  }

  depends_on = [google_project_service.services]
}

resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  location = google_cloud_run_v2_service.frontend.location
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
