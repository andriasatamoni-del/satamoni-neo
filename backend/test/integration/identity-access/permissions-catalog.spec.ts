import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import type { Database } from "../../../src/shared/database/database.token";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { PERMISSIONS } from "../../../src/contexts/identity-access/domain/permission";
import { permissions, rolePermissions } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";

const SRC = join(__dirname, "../../../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("permission catalog (database) vs code", () => {
  let db: Database;
  let catalogKeys: Set<string>;

  beforeAll(async () => {
    db = createScriptDb(process.env.DATABASE_URL as string);
    catalogKeys = new Set((await db.select({ key: permissions.key }).from(permissions)).map((r) => r.key));
  });

  afterAll(async () => {
    await closeScriptDb(db);
  });

  test("PERMISSION enum and the permissions table hold exactly the same keys", () => {
    const enumKeys = new Set<string>(PERMISSIONS);
    expect({
      missingFromTable: [...enumKeys].filter((k) => !catalogKeys.has(k)).sort(),
      missingFromEnum: [...catalogKeys].filter((k) => !enumKeys.has(k)).sort(),
    }).toEqual({ missingFromTable: [], missingFromEnum: [] });
  });

  test("permission checks use PERMISSION.* constants, not string literals", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/@RequirePermission\(([^)]*)\)|permissions\.has\(([^)]*)\)/g)) {
        if (/["'`]/.test(m[1] ?? m[2])) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("admin has every permission (each migration that adds a permission must grant it to admin)", async () => {
    const rows = await db.select({ key: rolePermissions.permission_key }).from(rolePermissions).where(eq(rolePermissions.role, "admin"));
    const adminKeys = new Set(rows.map((r) => r.key));
    expect([...catalogKeys].filter((k) => !adminKeys.has(k)).sort()).toEqual([]);
  });
});
