# No credentials in code — everything the workloads need lives here.

resource "random_password" "db" {
  length  = 32
  special = true
  # Avoid characters that break libpq connection strings / shell quoting.
  override_special = "!#%*_-+=:?"
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = "${local.prefix}-db-password"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]

  lifecycle {
    ignore_changes = [terraform_labels]
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db.result

  lifecycle {
    ignore_changes = [secret_data]
  }
}

# Value is filled in by hand after creating the OAuth client in the console:
#   gcloud secrets versions add sandbox-dev-oauth-client-secret --data-file=-
resource "google_secret_manager_secret" "oauth_client_secret" {
  secret_id = "${local.prefix}-oauth-client-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]

  lifecycle {
    ignore_changes = [terraform_labels]
  }
}

# Signing key for the session JWTs the backend issues after Google ID-token
# verification.
resource "random_password" "jwt_signing_key" {
  length  = 64
  special = false
}

resource "google_secret_manager_secret" "jwt_signing_key" {
  secret_id = "${local.prefix}-jwt-signing-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]

  lifecycle {
    ignore_changes = [terraform_labels]
  }
}

resource "google_secret_manager_secret_version" "jwt_signing_key" {
  secret      = google_secret_manager_secret.jwt_signing_key.id
  secret_data = random_password.jwt_signing_key.result

  lifecycle {
    ignore_changes = [secret_data]
  }
}

# RSA private key the backend signs exported reports with. Deliberately not a
# `tls_private_key` resource: that would put the private key in Terraform state
# in the clear. Generated and uploaded by hand, like the OAuth client secret:
#   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 |
#     gcloud secrets versions add sandbox-dev-report-signing-key --data-file=-
# Until a version exists the backend serves exports with no signature headers.
resource "google_secret_manager_secret" "report_signing_key" {
  secret_id = "${local.prefix}-report-signing-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]

  lifecycle {
    ignore_changes = [terraform_labels]
  }
}

# ── Access ───────────────────────────────────────────────────────────────────

resource "google_secret_manager_secret_iam_member" "backend_db_password" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_oauth_client_secret" {
  secret_id = google_secret_manager_secret.oauth_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_jwt_key" {
  secret_id = google_secret_manager_secret.jwt_signing_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_report_signing_key" {
  secret_id = google_secret_manager_secret.report_signing_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}
