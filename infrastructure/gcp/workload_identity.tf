# Keyless GitHub Actions auth — no service account JSON keys anywhere.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${local.prefix}-github-pool"
  display_name              = "GitHub Actions pool"
  description               = "Federated identities for ${local.github_repo_full}"

  depends_on = [google_project_service.services]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.actor"      = "assertion.actor"
    "attribute.ref"        = "assertion.ref"
  }

  # Without this condition any GitHub repo on earth could mint tokens.
  attribute_condition = "assertion.repository == '${local.github_repo_full}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_impersonation" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${local.github_repo_full}"
}
