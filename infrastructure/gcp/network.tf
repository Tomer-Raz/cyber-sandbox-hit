# Private networking is OFF by default: a Cloud NAT gateway plus a reserved IP
# costs ~$45/month even when idle, which is the single largest line item in this
# stack. With it off, Cloud SQL uses a public IP reached only through the Cloud
# SQL connector (TLS + IAM auth, no authorized networks), and Cloud Run uses
# default internet egress — both free.
#
# Set enable_private_networking = true for a production-grade posture: private
# Cloud SQL IP and one fixed, auditable egress IP for every scan.

locals {
  private_net = var.enable_private_networking ? 1 : 0
}

resource "google_compute_network" "main" {
  count = local.private_net

  name                    = "${local.prefix}-vpc"
  auto_create_subnetworks = false

  depends_on = [google_project_service.services]
}

resource "google_compute_subnetwork" "main" {
  count = local.private_net

  name          = "${local.prefix}-subnet"
  ip_cidr_range = "10.10.0.0/24"
  region        = var.region
  network       = google_compute_network.main[0].id

  private_ip_google_access = true
}

# Reserved range that Cloud SQL's private IP is allocated from.
resource "google_compute_global_address" "private_service_range" {
  count = local.private_net

  name          = "${local.prefix}-psa-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main[0].id
}

resource "google_service_networking_connection" "private_vpc" {
  count = local.private_net

  network                 = google_compute_network.main[0].id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_range[0].name]

  depends_on = [google_project_service.services]
}

# Scan jobs reach the internet through a NAT so all egress leaves from a single,
# auditable IP. Billed hourly per gateway + per reserved IP.
resource "google_compute_router" "nat_router" {
  count = local.private_net

  name    = "${local.prefix}-router"
  region  = var.region
  network = google_compute_network.main[0].id
}

resource "google_compute_address" "nat_ip" {
  count = local.private_net

  name   = "${local.prefix}-nat-ip"
  region = var.region
}

resource "google_compute_router_nat" "nat" {
  count = local.private_net

  name   = "${local.prefix}-nat"
  router = google_compute_router.nat_router[0].name
  region = var.region

  nat_ip_allocate_option = "MANUAL_ONLY"
  nat_ips                = [google_compute_address.nat_ip[0].self_link]

  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"

  subnetwork {
    name                    = google_compute_subnetwork.main[0].id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }

  # NAT logs are billable log ingestion; off to stay inside the free tier.
  log_config {
    enable = false
    filter = "ERRORS_ONLY"
  }
}
