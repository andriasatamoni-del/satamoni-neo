import { readFileSync } from "fs";
import { join } from "path";
import { PERMISSION, PERMISSIONS } from "../../../src/contexts/identity-access/domain/permission";

// The frontend keeps its own copy of the permission keys (there is no shared package between the two apps).
// This fails when one side adds, removes or renames a permission without the other.
const FRONTEND_PERMISSIONS_FILE = join(__dirname, "../../../../frontend/src/shared/auth/permissions.ts");

function frontendPermissionEntries(): Array<[string, string]> {
  const source = readFileSync(FRONTEND_PERMISSIONS_FILE, "utf8");
  const block = source.match(/export const PERMISSION = \{([\s\S]*?)\} as const;/);
  if (!block) throw new Error(`could not find "export const PERMISSION = { ... } as const;" in ${FRONTEND_PERMISSIONS_FILE}`);
  return [...block[1].matchAll(/^\s*([A-Z_]+):\s*"([a-z_.]+)",?\s*$/gm)].map((m) => [m[1], m[2]]);
}

describe("permission keys stay in sync between backend and frontend", () => {
  it("frontend PERMISSION has the same keys, values and order as the backend PERMISSION", () => {
    expect(frontendPermissionEntries()).toEqual(Object.entries(PERMISSION));
  });

  it("each constant name is its key upper-cased with dots as underscores", () => {
    for (const [name, key] of Object.entries(PERMISSION)) expect(name).toBe(key.toUpperCase().replace(/\./g, "_"));
  });

  it("backend PERMISSIONS is exactly the PERMISSION values, without duplicates", () => {
    expect(PERMISSIONS).toEqual(Object.values(PERMISSION));
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });
});
