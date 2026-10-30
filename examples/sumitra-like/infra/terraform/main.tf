resource "google_cloud_run_v2_service" "api" {
  name     = "sumitra-api"
  location = "asia-south1"
  template {
    containers {
      image = "asia-south1-docker.pkg.dev/tl-sumitra-prod/sumitra/sumitra-api:latest"
    }
    vpc_access {
      connector = google_vpc_access_connector.main.id
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance { instances = [google_sql_database_instance.main.connection_name] }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name   = google_cloud_run_v2_service.api.name
  role   = "roles/run.invoker"
  member = "allUsers"
}

resource "google_sql_database_instance" "main" {
  name             = "sumitra-db"
  database_version = "POSTGRES_15"
  region           = "asia-south1"
  deletion_protection = true
  settings {
    tier = "db-custom-2-7680"
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }
    backup_configuration { enabled = true }
  }
}

resource "google_storage_bucket" "payslips" {
  name     = "sumitra-payslips"
  location = "ASIA-SOUTH1"
  uniform_bucket_level_access = true
  encryption { default_kms_key_name = google_kms_crypto_key.payroll.id }
}

resource "google_kms_key_ring" "payroll" {
  name     = "payroll-ring"
  location = "asia-south1"
}

resource "google_kms_crypto_key" "payroll" {
  name     = "payroll-key"
  key_ring = google_kms_key_ring.payroll.id
}

resource "google_compute_network" "vpc" {
  name = "sumitra-vpc"
}

resource "google_vpc_access_connector" "main" {
  name    = "sumitra-connector"
  network = google_compute_network.vpc.name
}

resource "google_secret_manager_secret" "slack" {
  secret_id = "slack-bot-token"
  replication { auto {} }
}

resource "google_access_context_manager_service_perimeter" "payroll" {
  parent = "accessPolicies/123"
  name   = "accessPolicies/123/servicePerimeters/payroll"
  title  = "payroll-fence"
  use_explicit_dry_run_spec = true
  spec {
    restricted_services = ["cloudkms.googleapis.com", "storage.googleapis.com"]
  }
}
