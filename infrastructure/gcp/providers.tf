provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone

  default_labels = local.labels

  # Some APIs (billingbudgets) reject user credentials without an explicit
  # quota project. Bill those calls to this project instead of gcloud's shared
  # default, which has the API disabled.
  user_project_override = true
  billing_project       = var.project_id
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
  zone    = var.zone

  default_labels = local.labels

  user_project_override = true
  billing_project       = var.project_id
}

data "google_project" "this" {
  project_id = var.project_id
}
