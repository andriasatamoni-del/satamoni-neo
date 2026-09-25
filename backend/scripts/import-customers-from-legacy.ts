// استيراد العملاء من الريبو القديم - رقم التليفون، البيانات، ونقاط الولاء زي ما هي. password_hash
// بصيغة bcrypt قابلة للنقل بالحرف (نفس المكتبة) - عميل عنده حساب حقيقي بالفعل يقدر يسجّل دخول على
// neo بنفس كلمة السر من غير أي إعادة تعيين. دفتر العناوين (customer_addresses) بيتنقل كامل كمان.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { pgSslOption } from "../src/shared/database/pg-ssl";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselyCustomerRepository } from "../src/contexts/customers/infrastructure/persistence/kysely-customer.repository";
import { Customer } from "../src/contexts/customers/domain/customer.aggregate";

interface LegacyCustomerRow {
  id: number; phone: string; phone2: string | null; name: string | null; address_details: string | null;
  distinguishing_mark: string | null; notes: string | null; loyalty_points: number; password_hash: string | null;
  is_blocked: boolean; block_reason: string | null; created_at: Date; updated_at: Date;
}
interface LegacyCustomerAddressRow {
  id: number; customer_phone: string; label: string | null; address_details: string;
  distinguishing_mark: string | null; is_default: boolean; created_at: Date;
}

export interface ImportCounts { created: number; updated: number; skipped: number; }
export interface CustomersImportResult { customers: ImportCounts; }

export async function importCustomersFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<CustomersImportResult> {
  const customerRepo = new KyselyCustomerRepository(neoDb);

  const customers: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: customerRows } = await legacyPool.query<LegacyCustomerRow>(
    `SELECT id, phone, phone2, name, address_details, distinguishing_mark, notes, loyalty_points,
            password_hash, is_blocked, block_reason, created_at, updated_at
     FROM customers ORDER BY id`
  );
  const { rows: addressRows } = await legacyPool.query<LegacyCustomerAddressRow>(
    `SELECT id, customer_phone, label, address_details, distinguishing_mark, is_default, created_at
     FROM customer_addresses ORDER BY id`
  );
  const addressesByPhone = new Map<string, LegacyCustomerAddressRow[]>();
  for (const a of addressRows) {
    const list = addressesByPhone.get(a.customer_phone) ?? [];
    list.push(a);
    addressesByPhone.set(a.customer_phone, list);
  }

  for (const row of customerRows) {
    const existing = await customerRepo.findByLegacyCustomerId(row.id);
    try {
      const props = {
        phone2: row.phone2,
        name: row.name,
        addressDetails: row.address_details,
        distinguishingMark: row.distinguishing_mark,
        notes: row.notes,
        loyaltyPoints: row.loyalty_points,
        passwordHash: row.password_hash,
        isBlocked: row.is_blocked,
        blockReason: row.block_reason,
        blockedBy: null,
        blockedAt: row.is_blocked ? row.updated_at : null,
        legacyCustomerId: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      const legacyAddresses = (addressesByPhone.get(row.phone) ?? []).map((a) => ({
        id: randomUUID(),
        label: a.label,
        addressDetails: a.address_details,
        distinguishingMark: a.distinguishing_mark,
        isDefault: a.is_default,
        createdAt: a.created_at,
      }));

      const customer = Customer.reconstitute(existing?.id ?? randomUUID(), { phone: row.phone, addresses: legacyAddresses, ...props });
      await customerRepo.save(customer);
      if (existing) customers.updated++;
      else customers.created++;
    } catch (err) {
      console.warn(`⚠ تخطّي عميل legacy_id=${row.id} (${row.phone}): ${(err as Error).message}`);
      customers.skipped++;
    }
  }

  return { customers };
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl, ssl: pgSslOption() });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl, ssl: pgSslOption() }) }) });

  const result = await importCustomersFromLegacy(legacyPool, neoDb);
  console.log("✅ الاستيراد خلص:");
  console.log(`  العملاء: ${result.customers.created} جديد، ${result.customers.updated} اتحدّث، ${result.customers.skipped} اتخطّى`);

  await legacyPool.end();
  await neoDb.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ فشل الاستيراد:", err);
    process.exit(1);
  });
}
