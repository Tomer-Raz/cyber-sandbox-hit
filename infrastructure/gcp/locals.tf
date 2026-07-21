locals {
  prefix = "${var.name_prefix}-${var.environment}"

  labels = {
    project     = "cyber-sandbox-hit"
    environment = var.environment
    managed-by  = "terraform"
  }

  # Cloud Run frontend URL is only known after apply, so CORS is wired through
  # an env var that the backend reads at request time.
  github_repo_full = "${var.github_owner}/${var.github_repo}"
}
