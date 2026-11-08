import "dotenv/config";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_neo_test";
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("../safety/assert-disposable-db").assertDisposableDatabase(process.env.DATABASE_URL);
process.env.ACCOUNTING_ENFORCEMENT = process.env.ACCOUNTING_ENFORCEMENT || "deferred";
process.env.JWT_SECRET = process.env.JWT_SECRET || "neo_test_secret_do_not_use_in_production";
process.env.THROTTLE_LIMIT = "100000";
process.env.THROTTLE_LOGIN_LIMIT = "100000";
process.env.THROTTLE_STOREFRONT_ORDER_LIMIT = "100000";
process.env.THROTTLE_IMPORT_LIMIT = "100000";
process.env.META_APP_SECRET = "neo_test_meta_app_secret";
process.env.META_VERIFY_TOKEN = "neo_test_meta_verify_token";
for (const key of [
  "GEMINI_API_KEY", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "META_PAGE_ACCESS_TOKEN",
  "WHATSAPP_STAFF_NOTIFY_NUMBER", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN",
  "SMS_PROVIDER", "SMS_API_KEY", "SMS_SENDER_ID", "SMS_WEBHOOK_URL", "SMS_WEBHOOK_AUTH_HEADER", "PUBLIC_APP_URL",
]) {
  delete process.env[key];
}
