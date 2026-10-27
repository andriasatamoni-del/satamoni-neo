import "dotenv/config";
import * as bcrypt from "bcryptjs";
import type { Database } from "../../src/shared/database/database.token";
import { createScriptDb, closeScriptDb } from "../../src/shared/database/script-db";
import { UserRepository } from "../../src/contexts/identity-access/infrastructure/persistence/user.repository";
import { BranchRepository } from "../../src/contexts/branches/infrastructure/persistence/branch.repository";
import { User } from "../../src/contexts/identity-access/domain/user.aggregate";
import { Branch } from "../../src/contexts/branches/domain/branch.aggregate";

export const DEV_BRANCH_NAME = "فرع التجربة";

export const DEV_ACCOUNTS = [
  { email: "admin@satamoni.dev", secret: "admin123", role: "admin", name: "مدير النظام (تجربة)", branchBound: false },
  { email: "accountant@satamoni.dev", secret: "accountant123", role: "accountant", name: "محاسب (تجربة)", branchBound: false },
  { email: "callcenter@satamoni.dev", secret: "callcenter123", role: "callcenter", name: "كول سنتر (تجربة)", branchBound: false },
  { email: "manager@satamoni.dev", secret: "manager123", role: "branch_manager", name: "مدير فرع (تجربة)", branchBound: true },
  { email: "cashier@satamoni.dev", secret: "cashier123", role: "cashier", name: "كاشير (تجربة)", branchBound: true },
  { email: "driver@satamoni.dev", secret: "driver123", role: "driver", name: "طيار (تجربة)", branchBound: true },
  { email: "employee@satamoni.dev", secret: "employee123", role: "employee", name: "موظف (تجربة)", branchBound: true },
] as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertLocalDevDatabase(url: string | undefined, env: NodeJS.ProcessEnv = process.env): void {
  if (!url) throw new Error("DATABASE_URL is required");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL - refusing to seed");
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`DATABASE_URL host "${parsed.hostname}" is not local - the dev seed only runs against this machine`);
  }
  if (env.NODE_ENV === "production") throw new Error("NODE_ENV=production - refusing to seed dev accounts");
  if (env.PGSSL === "true") throw new Error("PGSSL=true points at a managed database - refusing to seed dev accounts");
}

async function ensureBranch(db: Database): Promise<string> {
  const repo = new BranchRepository(db);
  const existing = (await repo.list()).find((b) => b.name === DEV_BRANCH_NAME);
  if (existing) return existing.id;
  const branch = Branch.register({ name: DEV_BRANCH_NAME });
  await repo.save(branch);
  return branch.id;
}

export async function seedDev(db: Database): Promise<{ created: number; reset: number }> {
  const branchId = await ensureBranch(db);
  const repo = new UserRepository(db);
  let created = 0;
  let reset = 0;

  for (const account of DEV_ACCOUNTS) {
    const hash = await bcrypt.hash(account.secret, 10);
    const accountBranch = account.branchBound ? branchId : null;
    const existing = await repo.findByEmail(account.email);
    if (existing) {
      existing.changeRoles([account.role]);
      existing.changeBranch(accountBranch);
      existing.setPasswordHash(hash);
      existing.activate();
      await repo.save(existing);
      reset++;
    } else {
      await repo.save(User.register({ name: account.name, email: account.email, passwordHash: hash, roles: [account.role], branchId: accountBranch }));
      created++;
    }
  }
  return { created, reset };
}

async function main() {
  const url = process.env.DATABASE_URL;
  assertLocalDevDatabase(url);
  const db = createScriptDb(url!);
  try {
    const result = await seedDev(db);
    console.log(`✅ Dev seed done: ${result.created} created, ${result.reset} reset. Branch: ${DEV_BRANCH_NAME}`);
    for (const a of DEV_ACCOUNTS) console.log(`   ${a.role.padEnd(15)} ${a.email.padEnd(26)} ${a.secret}`);
  } finally {
    await closeScriptDb(db);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ Dev seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
