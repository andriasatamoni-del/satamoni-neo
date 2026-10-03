import * as fs from "node:fs";
import * as path from "node:path";

// verify-restore.sql is run by a human against a restored copy. These checks keep it that: read-only, guarded, SELECT-only.
const file = path.join(__dirname, "../../../scripts/backup/verify-restore.sql");
const sql = fs.readFileSync(file, "utf8");
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
const withoutGuardBody = code.replace(/DO \$guard\$[\s\S]*?\$guard\$;?/, "");

describe("verify-restore.sql is read-only and refuses non-scratch databases", () => {
  test("runs inside a READ ONLY transaction that is rolled back", () => {
    expect(code).toMatch(/^\s*\\set ON_ERROR_STOP on/m);
    expect(code).toMatch(/BEGIN TRANSACTION READ ONLY;/);
    expect(code.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(code).not.toMatch(/\bCOMMIT\b/i);
  });

  test("no statement that can change data, schema, settings or privileges", () => {
    const forbidden =
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|VACUUM|ANALYZE|REINDEX|CLUSTER|REFRESH|CALL|EXECUTE|PREPARE|LOCK|COMMENT|SECURITY|RESET|DISCARD|LISTEN|NOTIFY|SAVEPOINT|SET)\b/i;
    const offenders = withoutGuardBody
      .split("\n")
      .filter((l) => !l.trim().startsWith("\\")) // psql meta-commands (\set ON_ERROR_STOP, \echo)
      .filter((l) => forbidden.test(l.replace(/'[^']*'/g, "''")));
    expect(offenders).toEqual([]);
    // every remaining statement is a SELECT / WITH, the guard block, or a transaction boundary
    const statements = withoutGuardBody
      .split("\n")
      .filter((l) => !l.trim().startsWith("\\"))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const st of statements) expect(st).toMatch(/^(SELECT|WITH|BEGIN TRANSACTION READ ONLY|ROLLBACK)\b/i);
  });

  test("the guard only lets restore / scratch / drill / test databases through", () => {
    expect(sql).toContain("current_database() !~* '(restore|scratch|drill|test)'");
    expect(sql).toContain("RAISE EXCEPTION");
    // the guard comes before the first query
    expect(sql.indexOf("$guard$")).toBeLessThan(sql.indexOf("SELECT count(*) AS public_tables"));
    const nameRegex = /(restore|scratch|drill|test)/i;
    for (const ok of ["satamoni_restore_check", "satamoni_neo_restore_drill_17", "satamoni_neo_test", "scratch_1"]) expect(nameRegex.test(ok)).toBe(true);
    for (const bad of ["satamoni_neo", "postgres", "satamoni_production", "render_prod"]) expect(nameRegex.test(bad)).toBe(false);
  });

  test("no connection details or secrets inside the file", () => {
    expect(sql).not.toMatch(/postgres(ql)?:\/\//i);
    expect(sql).not.toMatch(/password\s*=|PGPASSWORD|BACKUP_ENCRYPTION_KEY/i);
  });
});
