import { readFileSync } from "fs";
import { join } from "path";
import { ROLE, ROLES } from "../../../src/contexts/identity-access/domain/role";

// The frontend keeps its own copy of the role list (there is no shared package between the two apps).
// This fails when one side adds, removes or renames a role without the other.
const FRONTEND_ROLES_FILE = join(__dirname, "../../../../frontend/src/shared/auth/roles.ts");

function frontendRoleEntries(): Array<[string, string]> {
  const source = readFileSync(FRONTEND_ROLES_FILE, "utf8");
  const block = source.match(/export const ROLE = \{([\s\S]*?)\} as const;/);
  if (!block) throw new Error(`could not find "export const ROLE = { ... } as const;" in ${FRONTEND_ROLES_FILE}`);
  return [...block[1].matchAll(/^\s*([A-Z_]+):\s*"([a-z_]+)",?\s*$/gm)].map((m) => [m[1], m[2]]);
}

describe("role list stays in sync between backend and frontend", () => {
  it("frontend ROLE has the same keys, values and order as the backend ROLE", () => {
    expect(frontendRoleEntries()).toEqual(Object.entries(ROLE));
  });

  it("backend ROLES is exactly the ROLE values", () => {
    expect(ROLES).toEqual(Object.values(ROLE));
  });
});
