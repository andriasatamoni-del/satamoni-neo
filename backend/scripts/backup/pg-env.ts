// بيحوّل DATABASE_URL لمتغيرات بيئة libpq (PGHOST/PGUSER/PGPASSWORD...) بدل ما الرابط كله (بالباسورد)
// يتبعت كـargument لـpg_dump/pg_restore - الـarguments بتبان لأي حد على نفس السيرفر في `ps`
export function pgEnvFromUrl(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  else if (process.env.PGSSL === "true") env.PGSSLMODE = "require";
  return env;
}

export function withDatabase(databaseUrl: string, dbName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}
