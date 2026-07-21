terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.12"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.12"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state. Create the bucket once (see README), then uncomment and run:
  #   terraform init -migrate-state
  #
  # backend "gcs" {
  #   bucket = "cyber-sandbox-hit-tfstate"
  #   prefix = "infra"
  # }
}
