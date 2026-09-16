// استيراد السائقين من الريبو القديم - مؤجّل: تسوية كاش السائق (driver_settlements) وحضوره/بونصه
// (driver_shifts) - راجع تعليق delivery-assignment.aggregate.ts (معتمدين على Payroll، Phase 4).
// مؤجّل كمان: تحويلات (delivery_assignments) تاريخية - dispatch_status/driver_id كانوا أعمدة على
// orders في الريبو القديم، واستيراد orders الحالي (import-orders-from-legacy.ts) مبيجيبش الأعمدة دي -
// ده تحسين مستقبلي لو فعلًا احتجنا تاريخ التوصيل القديم في تقارير.
import "dotenv/config";
import { Pool } from "pg";
import { pgSslOption } from "../src/shared/database/pg-ssl";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselyDriverRepository } from "../src/contexts/delivery/infrastructure/persistence/kysely-driver.repository";
import { KyselyBranchRepository } from "../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { Driver, DRIVER_STATUSES } from "../src/contexts/delivery/domain/driver.aggregate";

interface LegacyDriverRow {
  id: number; branch_id: number; name: string; phone: string | null; status: string;
}

export interface ImportCounts { created: number; updated: number; skipped: number; }

export async function importDriversFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<ImportCounts> {
  const driverRepo = new KyselyDriverRepository(neoDb);
  const branchRepo = new KyselyBranchRepository(neoDb);

  const result: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows } = await legacyPool.query<LegacyDriverRow>(`SELECT id, branch_id, name, phone, status FROM drivers ORDER BY id`);

  for (const row of rows) {
    if (!DRIVER_STATUSES.includes(row.status as (typeof DRIVER_STATUSES)[number])) {
      console.warn(`⚠ تخطّي سائق #${row.id} (${row.name}) - حالة غير معروفة: ${row.status}`);
      result.skipped++;
      continue;
    }
    const branch = await branchRepo.findByLegacyBranchId(row.branch_id);
    if (!branch) {
      console.warn(`⚠ تخطّي سائق #${row.id} - الفرع مش مستورد`);
      result.skipped++;
      continue;
    }

    const existing = await driverRepo.findByLegacyDriverId(row.id);
    const driver =
      existing ?? Driver.register({ name: row.name, phone: row.phone, branchId: branch.id, legacyDriverId: row.id });
    if (existing) driver.changeStatus(row.status);
    await driverRepo.save(driver);
    existing ? result.updated++ : result.created++;
  }

  return result;
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl, ssl: pgSslOption() });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl, ssl: pgSslOption() }) }) });

  const result = await importDriversFromLegacy(legacyPool, neoDb);
  console.log(`✅ الاستيراد خلص: ${result.created} جديد، ${result.updated} اتحدّث، ${result.skipped} اتخطّى`);

  await legacyPool.end();
  await neoDb.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ فشل الاستيراد:", err);
    process.exit(1);
  });
}
