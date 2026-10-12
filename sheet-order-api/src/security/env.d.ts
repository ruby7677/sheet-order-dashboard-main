export {};
declare global { interface Env {
  SERVICE_HMAC_SECRET?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
  ADMIN_EMAILS?: string;
  ALLOWED_ORIGINS?: string;
  TEST_SHEET_ID?: string;
  PRODUCTION_SHEET_ID?: string;

 APP_ENV?: string; } }
