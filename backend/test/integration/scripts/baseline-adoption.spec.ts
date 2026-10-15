import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client, Pool } from "pg";
import { withDatabase } from "../../../scripts/backup/pg-env";
import { LAST_KYSELY_MIGRATION, MIGRATIONS_FOLDER, runMigrations } from "../../../src/migrations/run-migrations";

// Switching from the Kysely migrator to Drizzle migrations, on DISPOSABLE databases (created and dropped by this test):
//   * a fresh database runs 0000_baseline (schema + seed rows),
//   * a database the Kysely migrator had brought to 058 (production, existing dev databases) adopts the baseline as
//     applied and never re-runs it,
//   * a database Kysely left before 058 is refused, so it can't end up with a half-applied schema,
//   * two migrators starting at once (overlapping instance starts) apply each migration once,
//   * a migration Drizzle would silently skip (out of timestamp order) is refused.
describe("Drizzle baseline adoption", () => {
  // each test migrates a whole database; under a full suite run that is slower than jest's 30 s default
  jest.setTimeout(120_000);
  const serverUrl = process.env.DATABASE_URL as string;
  const stamp = Date.now();
  const names = {
    fresh: `satamoni_neo_adopt_fresh_test_${stamp}`,
    kysely: `satamoni_neo_adopt_k058_test_${stamp}`,
    old: `satamoni_neo_adopt_old_test_${stamp}`,
    concurrent: `satamoni_neo_adopt_concurrent_test_${stamp}`,
    order: `satamoni_neo_adopt_order_test_${stamp}`,
  };
  let admin: Client;
  const pools: Pool[] = [];
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"));
  const migrationCount: number = journal.entries.length;
  const latestWhen: number = journal.entries[journal.entries.length - 1].when;
  const tmpDirs: string[] = [];
  afterAll(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  const baselineOnlyFolder = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "satamoni-baseline-"));
    tmpDirs.push(dir);
    fs.cpSync(MIGRATIONS_FOLDER, dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));
    return dir;
  };

  const open = (db: string) => {
    // DROP DATABASE ... WITH (FORCE) in afterAll terminates idle pooled connections; swallow that expected error.
    const pool = new Pool({ connectionString: withDatabase(serverUrl, db), max: 2 });
    pool.on("error", () => undefined);
    pools.push(pool);
    return pool;
  };
  const scalar = async (pool: Pool, text: string) => (await pool.query(text)).rows[0]?.v;

  // Simulates what the Kysely migrator left behind: the baseline schema plus its bookkeeping table, no Drizzle journal.
  const makeKyselyDatabase = async (db: string, lastMigration: string) => {
    await runMigrations(withDatabase(serverUrl, db), baselineOnlyFolder());
    const pool = open(db);
    await pool.query("DROP SCHEMA drizzle CASCADE");
    await pool.query("CREATE TABLE kysely_migration (name varchar(255) PRIMARY KEY, timestamp varchar(255) NOT NULL)");
    await pool.query("INSERT INTO kysely_migration VALUES ('001_create_identity_access_tables', now()::text), ($1, now()::text)", [lastMigration]);
    return pool;
  };

  beforeAll(async () => {
    admin = new Client({ connectionString: withDatabase(serverUrl, "postgres") });
    admin.on("error", () => undefined);
    await admin.connect();
    for (const db of Object.values(names)) await admin.query(`CREATE DATABASE "${db}"`);
  });

  afterAll(async () => {
    // FORCE terminates the pools' connections first, so ending the pools afterwards cannot wait on a busy client
    for (const db of Object.values(names)) await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
    for (const pool of pools) await pool.end().catch(() => undefined);
    await admin.end();
  });

  test("a fresh database runs the baseline and every later migration: schema, triggers and seed rows", async () => {
    await runMigrations(withDatabase(serverUrl, names.fresh));
    const pool = open(names.fresh);
    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM pg_tables WHERE schemaname = 'public'"))).toBe(99);
    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM pg_trigger WHERE NOT tgisinternal"))).toBe(6);
    expect(await scalar(pool, "SELECT email AS v FROM users")).toBe("talabat-integration@system.internal");
    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM home_tiles"))).toBe(10);
    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM drizzle.__drizzle_migrations"))).toBe(migrationCount);

    // running again changes nothing
    await runMigrations(withDatabase(serverUrl, names.fresh));
    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM drizzle.__drizzle_migrations"))).toBe(migrationCount);
    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM users"))).toBe(1);
  });

  test("a Kysely database at 058 adopts the baseline without re-running it, and keeps its data", async () => {
    const pool = await makeKyselyDatabase(names.kysely, LAST_KYSELY_MIGRATION);
    await pool.query("INSERT INTO branches (id, name, is_central_kitchen, supports_dine_in) VALUES (gen_random_uuid(), 'فرع قائم', false, true)");

    await runMigrations(withDatabase(serverUrl, names.kysely));

    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM drizzle.__drizzle_migrations"))).toBe(migrationCount);
    // the baseline did not run again: no second seed user, existing rows untouched, Kysely history kept
    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM users"))).toBe(1);
    expect(await scalar(pool, "SELECT name AS v FROM branches")).toBe("فرع قائم");
    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM kysely_migration"))).toBe(2);
    expect(await scalar(pool, "SELECT string_agg(role, ',') AS v FROM user_roles")).toBe("admin");
    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM permissions"))).toBeGreaterThan(100);
    expect(Number(await scalar(pool, "SELECT count(DISTINCT role) AS v FROM role_permissions"))).toBe(7);
  });

  test("a Kysely database that stopped before 058 is refused and left untouched", async () => {
    const pool = await makeKyselyDatabase(names.old, "056_customer_accounts_loyalty_media");

    await expect(runMigrations(withDatabase(serverUrl, names.old))).rejects.toThrow(/only up to "056_customer_accounts_loyalty_media"/);
    expect(await scalar(pool, "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS v")).toBeNull();
  });

  test("two migrators starting at once apply the baseline once", async () => {
    const url = withDatabase(serverUrl, names.concurrent);
    await Promise.all([runMigrations(url), runMigrations(url)]);
    const pool = open(names.concurrent);
    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM drizzle.__drizzle_migrations"))).toBe(migrationCount);
    expect(Number(await scalar(pool, "SELECT count(*) AS v FROM users"))).toBe(1);
  });

  describe("migrations out of timestamp order", () => {

    // a copy of the real migrations plus one more, generated with the given timestamp
    const folderWithExtra = (when: number) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "satamoni-migrations-"));
      tmpDirs.push(dir);
      fs.cpSync(MIGRATIONS_FOLDER, dir, { recursive: true });
      const tag = "9999_late_branch";
      fs.writeFileSync(path.join(dir, `${tag}.sql`), "CREATE TABLE late_branch_marker (id int);");
      const entries = [...journal.entries, { idx: journal.entries.length, version: "7", when, tag, breakpoints: true }];
      fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
      return dir;
    };

    test("a journal whose timestamps do not increase is refused", async () => {
      await expect(runMigrations(withDatabase(serverUrl, names.order), folderWithExtra(latestWhen - 1))).rejects.toThrow(
        /"9999_late_branch" is not newer than/
      );
    });

    test("a migration older than the newest applied one is refused, not skipped", async () => {
      const url = withDatabase(serverUrl, names.order);
      await runMigrations(url);
      const pool = open(names.order);
      // another branch's migration, generated later, was deployed first
      await pool.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('other-branch', $1)", [latestWhen + 10]);

      await expect(runMigrations(url, folderWithExtra(latestWhen + 5))).rejects.toThrow(/"9999_late_branch" was never applied/);
      expect(await scalar(pool, "SELECT to_regclass('public.late_branch_marker')::text AS v")).toBeNull();
    });
  });
});
