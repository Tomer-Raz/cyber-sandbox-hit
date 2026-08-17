# Scan job template. The backend does not create a job per scan — it starts an
# execution of this job with per-scan env overrides, and the task container is
# torn down the moment the scan finishes.

resource "google_cloud_run_v2_job" "scanner" {
  name     = "${local.prefix}-scanner"
  location = var.region

  deletion_protection = false

  template {
    parallelism = 1
    task_count  = 1

    template {
      service_account = google_service_account.scanner.email
      timeout         = var.scanner_timeout
      max_retries     = 0 # a half-run scan must not silently repeat against a target

      # With private networking on, scans egress through the NAT so every packet
      # leaves from one auditable IP. Off, they use default Cloud Run egress.
      dynamic "vpc_access" {
        for_each = var.enable_private_networking ? [1] : []
        content {
          egress = "ALL_TRAFFIC"
          network_interfaces {
            network    = google_compute_network.main[0].id
            subnetwork = google_compute_subnetwork.main[0].id
          }
        }
      }

      containers {
        image = var.scanner_image

        resources {
          limits = {
            cpu    = var.scanner_cpu
            memory = var.scanner_memory
          }
        }

        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }
        env {
          name  = "FIRESTORE_DATABASE"
          value = google_firestore_database.main.name
        }
        env {
          name  = "VERTEX_LOCATION"
          value = var.vertex_location
        }
        env {
          name  = "VERTEX_MODEL"
          value = var.vertex_model
        }
        # TARGET_URL, SCAN_ID and SCAN_POLICY are supplied as overrides on each
        # execution by the backend.
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      template[0].labels,
      client,
      client_version,
      terraform_labels,
      effective_labels,
    ]
  }

  depends_on = [google_project_service.services]
}
