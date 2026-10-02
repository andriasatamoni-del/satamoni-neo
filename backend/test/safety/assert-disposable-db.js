// Guard (BL-14 #6): integration tests DROP SCHEMA and run destructive/failure-injection SQL. They may only ever
// run against a local, clearly-named disposable database - never a production/staging URL that leaked into
// the environment (e.g. a real DATABASE_URL from .env).
function assertDisposableDatabase(url, label = "TEST_DATABASE_URL") {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not a valid URL - refusing to run destructive tests`);
  }
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const allowRemote = process.env.ALLOW_REMOTE_DISPOSABLE_TEST_DB === "1";
  if (!localHosts.has(parsed.hostname) && !allowRemote) {
    throw new Error(`${label} host "${parsed.hostname}" is not local - refusing to run destructive tests`);
  }
  if (!/(test|scratch|disposable|ci)/i.test(dbName)) {
    throw new Error(`${label} database "${dbName}" does not look disposable (must contain test/scratch/disposable/ci) - refusing`);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NODE_ENV=production - refusing to run destructive tests");
  }
}
module.exports = { assertDisposableDatabase };
