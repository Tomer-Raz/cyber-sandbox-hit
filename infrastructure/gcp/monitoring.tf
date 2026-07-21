locals {
  alerts_enabled = var.alert_email != ""
}

resource "google_monitoring_notification_channel" "email" {
  count = local.alerts_enabled ? 1 : 0

  display_name = "${local.prefix} alerts"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.services]
}

# Backend is throwing 5xx — the SPA is effectively down.
resource "google_monitoring_alert_policy" "backend_errors" {
  count = local.alerts_enabled ? 1 : 0

  display_name = "${local.prefix} backend 5xx rate"
  combiner     = "OR"

  conditions {
    display_name = "5xx responses > 5 in 5m"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloud_run_revision\"",
        "resource.label.\"service_name\" = \"${google_cloud_run_v2_service.backend.name}\"",
        "metric.type = \"run.googleapis.com/request_count\"",
        "metric.label.\"response_code_class\" = \"5xx\"",
      ])

      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email[0].id]

  alert_strategy {
    auto_close = "1800s"
  }
}

# Scan jobs failing means scans silently never finish.
resource "google_monitoring_alert_policy" "scan_job_failures" {
  count = local.alerts_enabled ? 1 : 0

  display_name = "${local.prefix} scan job failures"
  combiner     = "OR"

  conditions {
    display_name = "Failed scan task completions"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloud_run_job\"",
        "resource.label.\"job_name\" = \"${google_cloud_run_v2_job.scanner.name}\"",
        "metric.type = \"run.googleapis.com/job/completed_task_attempt_count\"",
        "metric.label.\"result\" = \"failed\"",
      ])

      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "60s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email[0].id]

  alert_strategy {
    auto_close = "1800s"
  }
}
