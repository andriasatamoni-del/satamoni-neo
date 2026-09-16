// استيراد الفروع من الريبو القديم - لازم يشتغل الأول قبل استيراد المستخدمين/CRM/المخزون، عشان
// backfill الـbranch_id الحقيقي في الـcontexts التانية يلاقي فرع جاهز يترجم له
import "dotenv/config";
import { Pool } from "pg";
import { pgSslOption } from "../src/shared/database/pg-ssl";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselyBranchRepository } from "../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { Branch } from "../src/contexts/branches/domain/branch.aggregate";

interface LegacyBranchRow {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  hours: string | null;
  lat: number | null;
  lng: number | null;
  is_central_kitchen: boolean;
  supports_dine_in: boolean;
}

export interface ImportCounts {
  created: number;
  updated: number;
}

export async function importBranchesFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<ImportCounts> {
  const repo = new KyselyBranchRepository(neoDb);
  const { rows } = await legacyPool.query<LegacyBranchRow>(
    `SELECT id, name, address, phone, hours, lat, lng, is_central_kitchen, supports_dine_in
     FROM branches ORDER BY id`
  );

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await repo.findByLegacyBranchId(row.id);
    if (existing) {
      existing.rename(row.name);
      existing.updateDetails({ address: row.address, phone: row.phone, hours: row.hours });
      await repo.save(existing);
      updated++;
    } else {
      const branch = Branch.register({
        name: row.name,
        address: row.address,
        phone: row.phone,
        hours: row.hours,
        lat: row.lat != null ? Number(row.lat) : null,
        lng: row.lng != null ? Number(row.lng) : null,
        isCentralKitchen: row.is_central_kitchen,
        supportsDineIn: row.supports_dine_in,
        legacyBranchId: row.id,
      });
      await repo.save(branch);
      created++;
    }
  }

  return { created, updated };
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl, ssl: pgSslOption() });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl, ssl: pgSslOption() }) }) });

  const result = await importBranchesFromLegacy(legacyPool, neoDb);
  console.log(`✅ الاستيراد خلص: ${result.created} جديد، ${result.updated} اتحدّث`);

  await legacyPool.end();
  await neoDb.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ فشل الاستيراد:", err);
    process.exit(1);
  });
}
