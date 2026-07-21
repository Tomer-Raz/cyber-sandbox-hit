resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "${var.name_prefix}-images"
  description   = "Backend, frontend and scanner container images"
  format        = "DOCKER"

  docker_config {
    immutable_tags = false
  }

  cleanup_policy_dry_run = false

  # Storage is free up to 0.5 GB, then billed per GB — keep the repo small.
  cleanup_policies {
    id     = "keep-recent-releases"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }

  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "259200s" # 3 days
    }
  }

  depends_on = [google_project_service.services]
}
