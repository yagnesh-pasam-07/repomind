resource "google_cloud_run_v2_service" "api" {
  name     = "api"
  location = "asia-south1"
}

resource "google_sql_database_instance" "main" {
  name             = "payroll-db"
  database_version = "POSTGRES_15"
}

resource "google_storage_bucket_iam_member" "public" {
  bucket = "payslips"
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
