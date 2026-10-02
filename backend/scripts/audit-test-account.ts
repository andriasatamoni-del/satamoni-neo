// READ-ONLY owner tool (BL-14). Reports whether the previously committed, now-compromised test admin
// account exists in the database pointed to by DATABASE_URL. It runs a single SELECT inside a READ ONLY
// transaction and never prints password hashes. Deactivating/deleting the account is a deliberate owner
// action: see docs/SECURITY_HARDENING.md for the exact SQL/steps.
//
// Run locally by the owner:  DATABASE_URL=... PGSSL=true npx ts-node scripts/audit-test-account.ts
import "dotenv/config";
import { Pool } from "pg";
import { pgSslOption } from "../src/shared/database/pg-ssl";

export const COMPROMISED_ACCOUNT_EMAILS = ["admin-test@satamoni-neo.local"] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: url, ssl: pgSslOption(), max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query(
      "SELECT id, email, role, is_active, created_at FROM users WHERE lower(email) = ANY($1::text[])",
      [COMPROMISED_ACCOUNT_EMAILS.map((e) => e.toLowerCase())]
    );
    await client.query("ROLLBACK");
    if (rows.length === 0) {
      console.log("OK: no compromised test account found.");
      return;
    }
    for (const r of rows) {
      console.log(`FOUND: ${r.email} role=${r.role} active=${r.is_active} created=${r.created_at.toISOString()} id=${r.id}`);
    }
    console.log("ACTION REQUIRED: deactivate or delete the account(s) above (see docs/SECURITY_HARDENING.md).");
    process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
