import type { CostInfo, Layer, NodeKind } from './types.js';

/** A known third-party or cloud service, recognised by SDK packages, env keys or hostnames. */
export interface Provider {
  id: string;
  label: string;
  category: string;
  layer: Layer;
  kind: NodeKind;
  packages: string[];
  envPrefixes?: string[];
  hosts?: string[];
  cost: CostInfo;
  edge?: 'sends' | 'calls' | 'reads' | 'writes' | 'uses';
}

const ext = (
  id: string,
  label: string,
  category: string,
  packages: string[],
  envPrefixes: string[],
  cost: CostInfo,
  hosts: string[] = [],
  edge: Provider['edge'] = 'calls',
): Provider => ({ id: `ext:${id}`, label, category, layer: 'external', kind: 'external', packages, envPrefixes, hosts, cost, edge });

export const PROVIDERS: Provider[] = [
  // Messaging: SMS / WhatsApp / push
  ext('twilio', 'Twilio', 'SMS & voice', ['twilio'], ['TWILIO_'], { tier: 'medium', model: 'per SMS / call' }, ['api.twilio.com'], 'sends'),
  ext('msg91', 'MSG91', 'SMS & OTP', ['msg91', 'msg91-api', 'msg91-sms'], ['MSG91_'], { tier: 'medium', model: 'per SMS' }, ['api.msg91.com', 'control.msg91.com'], 'sends'),
  ext('gupshup', 'Gupshup', 'SMS & WhatsApp', [], ['GUPSHUP_'], { tier: 'medium', model: 'per message' }, ['api.gupshup.io'], 'sends'),
  ext('aws-sns', 'AWS SNS', 'SMS & push', ['@aws-sdk/client-sns', 'aws-sdk'], ['SNS_'], { tier: 'low', model: 'per message' }, [], 'sends'),
  ext('expo-push', 'Expo Push', 'Push notifications', ['expo-notifications', 'expo-server-sdk'], ['EXPO_ACCESS_TOKEN'], { tier: 'free', model: 'free tier' }, ['exp.host'], 'sends'),
  ext('fcm', 'Firebase', 'Push, auth & analytics', ['firebase', 'firebase-admin', '@react-native-firebase/app', '@react-native-firebase/messaging'], ['FIREBASE_'], { tier: 'low', model: 'usage-based' }, ['fcm.googleapis.com'], 'sends'),
  ext('onesignal', 'OneSignal', 'Push notifications', ['onesignal-node', 'react-native-onesignal', '@onesignal/node-onesignal'], ['ONESIGNAL_'], { tier: 'low', model: 'per subscriber' }, [], 'sends'),

  // Email
  ext('sendgrid', 'SendGrid', 'Email', ['@sendgrid/mail'], ['SENDGRID_'], { tier: 'low', model: 'per email' }, ['api.sendgrid.com'], 'sends'),
  ext('resend', 'Resend', 'Email', ['resend'], ['RESEND_'], { tier: 'low', model: 'per email' }, ['api.resend.com'], 'sends'),
  ext('postmark', 'Postmark', 'Email', ['postmark'], ['POSTMARK_'], { tier: 'low', model: 'per email' }, [], 'sends'),
  ext('mailgun', 'Mailgun', 'Email', ['mailgun.js', 'mailgun-js'], ['MAILGUN_'], { tier: 'low', model: 'per email' }, [], 'sends'),
  ext('aws-ses', 'AWS SES', 'Email', ['@aws-sdk/client-ses', '@aws-sdk/client-sesv2'], ['SES_'], { tier: 'low', model: 'per email' }, [], 'sends'),
  ext('smtp', 'SMTP server', 'Email', ['nodemailer'], ['SMTP_', 'MAIL_'], { tier: 'low', model: 'depends on host' }, [], 'sends'),

  // Payments
  ext('razorpay', 'Razorpay', 'Payments', ['razorpay', 'react-native-razorpay'], ['RAZORPAY_'], { tier: 'high', model: '% per transaction' }, ['api.razorpay.com']),
  ext('stripe', 'Stripe', 'Payments', ['stripe', '@stripe/stripe-js', '@stripe/stripe-react-native', '@stripe/react-stripe-js'], ['STRIPE_'], { tier: 'high', model: '% per transaction' }, ['api.stripe.com']),
  ext('cashfree', 'Cashfree', 'Payments', ['cashfree-pg', 'cashfree-sdk'], ['CASHFREE_'], { tier: 'high', model: '% per transaction' }),

  // Collaboration / HR
  ext('slack', 'Slack', 'Chat & notifications', ['@slack/web-api', '@slack/bolt', '@slack/webhook'], ['SLACK_'], { tier: 'free', model: 'API free' }, ['hooks.slack.com', 'slack.com/api'], 'sends'),
  ext('msteams', 'Microsoft Teams', 'Chat & notifications', ['botbuilder', '@microsoft/teams-js'], ['TEAMS_'], { tier: 'free', model: 'API free' }, ['webhook.office.com'], 'sends'),
  ext('keka', 'Keka', 'HR platform', [], ['KEKA_'], { tier: 'medium', model: 'per employee (subscription)' }, ['keka.com']),
  ext('google-apis', 'Google Workspace APIs', 'Calendar, Drive, Gmail', ['googleapis', '@googleapis/calendar', '@googleapis/drive'], ['GOOGLE_CLIENT_', 'GOOGLE_OAUTH_'], { tier: 'free', model: 'quota-based' }, ['www.googleapis.com']),
  ext('jira', 'Jira', 'Issue tracking', ['jira-client', 'jira.js'], ['JIRA_'], { tier: 'free', model: 'API free' }, ['atlassian.net']),

  // Auth
  ext('clerk', 'Clerk', 'Auth', ['@clerk/nextjs', '@clerk/clerk-expo', '@clerk/clerk-sdk-node', '@clerk/express'], ['CLERK_'], { tier: 'medium', model: 'per monthly active user' }),
  ext('auth0', 'Auth0', 'Auth', ['auth0', '@auth0/nextjs-auth0', 'react-native-auth0'], ['AUTH0_'], { tier: 'medium', model: 'per monthly active user' }),
  ext('supabase', 'Supabase', 'Auth & Postgres', ['@supabase/supabase-js'], ['SUPABASE_'], { tier: 'medium', model: 'per project + usage' }),

  // AI
  ext('openai', 'OpenAI', 'LLM API', ['openai', '@ai-sdk/openai'], ['OPENAI_'], { tier: 'high', model: 'per token' }, ['api.openai.com']),
  ext('anthropic', 'Anthropic', 'LLM API', ['@anthropic-ai/sdk', '@ai-sdk/anthropic'], ['ANTHROPIC_'], { tier: 'high', model: 'per token' }, ['api.anthropic.com']),
  ext('gemini', 'Google Gemini', 'LLM API', ['@google/generative-ai', '@google/genai', '@ai-sdk/google'], ['GEMINI_', 'GOOGLE_AI_'], { tier: 'high', model: 'per token' }),

  // Observability / analytics
  ext('sentry', 'Sentry', 'Error tracking', ['@sentry/node', '@sentry/react', '@sentry/react-native', '@sentry/nextjs', '@sentry/browser', 'sentry-expo'], ['SENTRY_'], { tier: 'low', model: 'per event' }),
  ext('posthog', 'PostHog', 'Product analytics', ['posthog-js', 'posthog-node', 'posthog-react-native'], ['POSTHOG_', 'NEXT_PUBLIC_POSTHOG_'], { tier: 'low', model: 'per event' }),
  ext('mixpanel', 'Mixpanel', 'Product analytics', ['mixpanel', 'mixpanel-browser', 'mixpanel-react-native'], ['MIXPANEL_'], { tier: 'low', model: 'per event' }),
  ext('datadog', 'Datadog', 'Monitoring', ['dd-trace', '@datadog/browser-rum'], ['DD_', 'DATADOG_'], { tier: 'high', model: 'per host / GB' }),

  // Storage & media outside GCP
  ext('aws-s3', 'AWS S3', 'Object storage', ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'], ['AWS_S3_', 'S3_'], { tier: 'low', model: 'per GB + requests' }, [], 'writes'),
  ext('r2', 'Cloudflare R2', 'Object storage', [], ['R2_', 'CLOUDFLARE_R2_'], { tier: 'low', model: 'per GB' }, ['r2.cloudflarestorage.com'], 'writes'),
  ext('cloudinary', 'Cloudinary', 'Media', ['cloudinary'], ['CLOUDINARY_'], { tier: 'low', model: 'credits' }, [], 'writes'),

  // Managed databases outside GCP
  { id: 'data:neon', label: 'Neon Postgres', category: 'Serverless Postgres', layer: 'data', kind: 'database', packages: ['@neondatabase/serverless'], envPrefixes: ['NEON_'], hosts: ['neon.tech'], cost: { tier: 'low', model: 'compute-hours + storage' }, edge: 'reads' },
  { id: 'data:mongodb-atlas', label: 'MongoDB Atlas', category: 'Document database', layer: 'data', kind: 'database', packages: [], envPrefixes: ['MONGODB_ATLAS'], hosts: ['mongodb.net'], cost: { tier: 'medium', model: 'per cluster-hour' }, edge: 'reads' },
  { id: 'data:upstash', label: 'Upstash Redis', category: 'Serverless Redis', layer: 'data', kind: 'cache', packages: ['@upstash/redis'], envPrefixes: ['UPSTASH_'], cost: { tier: 'low', model: 'per request' }, edge: 'reads' },

  // GCP services used from application code
  { id: 'gcp:storage', label: 'Cloud Storage', category: 'GCP · object storage', layer: 'cloud', kind: 'bucket', packages: ['@google-cloud/storage'], envPrefixes: ['GCS_', 'GCP_BUCKET'], cost: { tier: 'low', model: 'per GB + operations' }, edge: 'writes' },
  { id: 'gcp:kms', label: 'Cloud KMS', category: 'GCP · encryption keys', layer: 'cloud', kind: 'secret', packages: ['@google-cloud/kms'], envPrefixes: ['KMS_'], cost: { tier: 'low', model: 'per key version + operation' }, edge: 'uses' },
  { id: 'gcp:pubsub', label: 'Pub/Sub', category: 'GCP · messaging', layer: 'cloud', kind: 'queue', packages: ['@google-cloud/pubsub'], envPrefixes: ['PUBSUB_'], cost: { tier: 'low', model: 'per GB' }, edge: 'sends' },
  { id: 'gcp:secret-manager', label: 'Secret Manager', category: 'GCP · secrets', layer: 'cloud', kind: 'secret', packages: ['@google-cloud/secret-manager'], envPrefixes: [], cost: { tier: 'low', model: 'per secret version + access' }, edge: 'reads' },
  { id: 'gcp:tasks', label: 'Cloud Tasks', category: 'GCP · task queue', layer: 'cloud', kind: 'queue', packages: ['@google-cloud/tasks'], envPrefixes: [], cost: { tier: 'low', model: 'per operation' }, edge: 'sends' },
  { id: 'gcp:bigquery', label: 'BigQuery', category: 'GCP · analytics', layer: 'cloud', kind: 'database', packages: ['@google-cloud/bigquery'], envPrefixes: ['BIGQUERY_'], cost: { tier: 'medium', model: 'per TB scanned' }, edge: 'writes' },
  { id: 'gcp:firestore', label: 'Firestore', category: 'GCP · document database', layer: 'cloud', kind: 'database', packages: ['@google-cloud/firestore'], envPrefixes: [], cost: { tier: 'low', model: 'per read/write' }, edge: 'reads' },
  { id: 'gcp:logging', label: 'Cloud Logging', category: 'GCP · logs', layer: 'cloud', kind: 'cloud', packages: ['@google-cloud/logging', '@google-cloud/logging-winston'], envPrefixes: [], cost: { tier: 'low', model: 'per GB ingested' }, edge: 'writes' },
];

/** Databases / caches / queues detected from driver packages. */
export interface DataStore {
  id: string;
  label: string;
  kind: NodeKind;
  packages: string[];
  composeImages: string[];
  envPrefixes: string[];
}

export const DATA_STORES: DataStore[] = [
  { id: 'data:postgres', label: 'PostgreSQL', kind: 'database', packages: ['pg', 'postgres', 'pg-promise', '@vercel/postgres', 'slonik'], composeImages: ['postgres', 'postgis/postgis'], envPrefixes: ['DATABASE_URL', 'POSTGRES_', 'PG'] },
  { id: 'data:mysql', label: 'MySQL', kind: 'database', packages: ['mysql', 'mysql2'], composeImages: ['mysql', 'mariadb'], envPrefixes: ['MYSQL_'] },
  { id: 'data:mongodb', label: 'MongoDB', kind: 'database', packages: ['mongodb', 'mongoose'], composeImages: ['mongo'], envPrefixes: ['MONGO'] },
  { id: 'data:redis', label: 'Redis', kind: 'cache', packages: ['redis', 'ioredis'], composeImages: ['redis', 'valkey/valkey'], envPrefixes: ['REDIS_'] },
  { id: 'data:queue', label: 'Job queue (BullMQ)', kind: 'queue', packages: ['bullmq', 'bull', 'bee-queue'], composeImages: [], envPrefixes: [] },
  { id: 'data:sqlite', label: 'SQLite', kind: 'database', packages: ['better-sqlite3', 'sqlite3', 'expo-sqlite'], composeImages: [], envPrefixes: [] },
  { id: 'data:elasticsearch', label: 'Elasticsearch', kind: 'database', packages: ['@elastic/elasticsearch'], composeImages: ['elasticsearch', 'docker.elastic.co/elasticsearch/elasticsearch'], envPrefixes: ['ELASTIC'] },
];

/** ORMs tell us "this app talks to a DB" even when the driver is implicit. */
export const ORMS: Record<string, string> = {
  '@prisma/client': 'Prisma',
  prisma: 'Prisma',
  'drizzle-orm': 'Drizzle',
  typeorm: 'TypeORM',
  sequelize: 'Sequelize',
  knex: 'Knex',
  '@mikro-orm/core': 'MikroORM',
  mongoose: 'Mongoose',
};

export interface Framework {
  name: string;
  packages: string[];
  role: 'web' | 'mobile' | 'server' | 'fullstack' | 'desktop';
}

/** Ordered: first match wins. */
export const FRAMEWORKS: Framework[] = [
  { name: 'Expo / React Native', packages: ['expo'], role: 'mobile' },
  { name: 'React Native', packages: ['react-native'], role: 'mobile' },
  { name: 'Electron', packages: ['electron'], role: 'desktop' },
  { name: 'Next.js', packages: ['next'], role: 'fullstack' },
  { name: 'Remix', packages: ['@remix-run/node', '@remix-run/react'], role: 'fullstack' },
  { name: 'Nuxt', packages: ['nuxt'], role: 'fullstack' },
  { name: 'NestJS', packages: ['@nestjs/core'], role: 'server' },
  { name: 'Express', packages: ['express'], role: 'server' },
  { name: 'Fastify', packages: ['fastify'], role: 'server' },
  { name: 'Hono', packages: ['hono'], role: 'server' },
  { name: 'Koa', packages: ['koa'], role: 'server' },
  { name: 'tRPC', packages: ['@trpc/server'], role: 'server' },
  { name: 'Apollo GraphQL', packages: ['@apollo/server', 'apollo-server', 'apollo-server-express'], role: 'server' },
  { name: 'Vite + React', packages: ['vite'], role: 'web' },
  { name: 'Create React App', packages: ['react-scripts'], role: 'web' },
  { name: 'Vue', packages: ['vue'], role: 'web' },
  { name: 'Angular', packages: ['@angular/core'], role: 'web' },
  { name: 'Svelte', packages: ['svelte'], role: 'web' },
  { name: 'React', packages: ['react'], role: 'web' },
];

/** Terraform google_* resource types we draw, and how. */
export interface TfType {
  label: string;
  kind: NodeKind;
  layer: Layer;
  cost: CostInfo;
}

export const TF_TYPES: Record<string, TfType> = {
  google_cloud_run_v2_service: { label: 'Cloud Run', kind: 'cloud', layer: 'cloud', cost: { tier: 'medium', model: 'per vCPU-second + requests' } },
  google_cloud_run_service: { label: 'Cloud Run', kind: 'cloud', layer: 'cloud', cost: { tier: 'medium', model: 'per vCPU-second + requests' } },
  google_cloud_run_v2_job: { label: 'Cloud Run job', kind: 'cloud', layer: 'cloud', cost: { tier: 'low', model: 'per vCPU-second' } },
  google_cloudfunctions2_function: { label: 'Cloud Function', kind: 'cloud', layer: 'cloud', cost: { tier: 'low', model: 'per invocation + compute' } },
  google_cloudfunctions_function: { label: 'Cloud Function', kind: 'cloud', layer: 'cloud', cost: { tier: 'low', model: 'per invocation + compute' } },
  google_app_engine_application: { label: 'App Engine', kind: 'cloud', layer: 'cloud', cost: { tier: 'medium', model: 'per instance-hour' } },
  google_compute_instance: { label: 'Compute Engine VM', kind: 'cloud', layer: 'cloud', cost: { tier: 'high', model: 'per instance-hour' } },
  google_container_cluster: { label: 'GKE cluster', kind: 'cloud', layer: 'cloud', cost: { tier: 'high', model: 'per cluster + nodes' } },
  google_sql_database_instance: { label: 'Cloud SQL', kind: 'database', layer: 'data', cost: { tier: 'high', model: 'per instance-hour + storage' } },
  google_redis_instance: { label: 'Memorystore Redis', kind: 'cache', layer: 'data', cost: { tier: 'high', model: 'per GB-hour' } },
  google_firestore_database: { label: 'Firestore', kind: 'database', layer: 'data', cost: { tier: 'low', model: 'per read/write' } },
  google_bigquery_dataset: { label: 'BigQuery dataset', kind: 'database', layer: 'data', cost: { tier: 'medium', model: 'per TB scanned' } },
  google_storage_bucket: { label: 'Cloud Storage bucket', kind: 'bucket', layer: 'cloud', cost: { tier: 'low', model: 'per GB + operations' } },
  google_pubsub_topic: { label: 'Pub/Sub topic', kind: 'queue', layer: 'cloud', cost: { tier: 'low', model: 'per GB' } },
  google_cloud_tasks_queue: { label: 'Cloud Tasks queue', kind: 'queue', layer: 'cloud', cost: { tier: 'low', model: 'per operation' } },
  google_cloud_scheduler_job: { label: 'Cloud Scheduler', kind: 'cloud', layer: 'cloud', cost: { tier: 'free', model: '3 jobs free' } },
  google_kms_key_ring: { label: 'KMS key ring', kind: 'secret', layer: 'cloud', cost: { tier: 'free', model: 'free' } },
  google_kms_crypto_key: { label: 'KMS key', kind: 'secret', layer: 'cloud', cost: { tier: 'low', model: 'per key version + operation' } },
  google_secret_manager_secret: { label: 'Secret', kind: 'secret', layer: 'cloud', cost: { tier: 'low', model: 'per secret version' } },
  google_compute_network: { label: 'VPC network', kind: 'network', layer: 'cloud', cost: { tier: 'free', model: 'free' } },
  google_compute_subnetwork: { label: 'Subnet', kind: 'network', layer: 'cloud', cost: { tier: 'free', model: 'free' } },
  google_vpc_access_connector: { label: 'Serverless VPC connector', kind: 'network', layer: 'cloud', cost: { tier: 'medium', model: 'per instance-hour' } },
  google_access_context_manager_service_perimeter: { label: 'VPC Service Controls perimeter', kind: 'network', layer: 'cloud', cost: { tier: 'free', model: 'free' } },
  google_compute_router_nat: { label: 'Cloud NAT', kind: 'network', layer: 'cloud', cost: { tier: 'medium', model: 'per gateway-hour + GB' } },
  google_compute_global_address: { label: 'Static IP', kind: 'network', layer: 'cloud', cost: { tier: 'low', model: 'per hour' } },
  google_compute_global_forwarding_rule: { label: 'Load balancer', kind: 'network', layer: 'cloud', cost: { tier: 'medium', model: 'per rule-hour + GB' } },
  google_compute_url_map: { label: 'Load balancer URL map', kind: 'network', layer: 'cloud', cost: { tier: 'free', model: 'included' } },
  google_artifact_registry_repository: { label: 'Artifact Registry', kind: 'cloud', layer: 'cloud', cost: { tier: 'low', model: 'per GB' } },
  google_service_account: { label: 'Service account', kind: 'secret', layer: 'cloud', cost: { tier: 'free', model: 'free' } },
  google_monitoring_alert_policy: { label: 'Alert policy', kind: 'cloud', layer: 'cloud', cost: { tier: 'free', model: 'free' } },
};

/** Infra types that are config, not things — used by rules, not drawn. */
export const TF_HIDDEN = /_(iam_member|iam_binding|iam_policy|project_service|project_iam_.*)$|^google_project_service$|^google_compute_firewall$|^google_sql_database$|^google_sql_user$|^google_secret_manager_secret_version$|^google_project$/;
