// استيراد دليل الحسابات من الريبو القديم - لازم يشتغل بعد استيراد الفروع (Branches)، عشان branch_id
// الحقيقي يترجم صح. القيود (journal_entries) نفسها مش بتتستورد - القيود التاريخية هتتغطّى بقيود آلية
// جديدة من الأحداث التشغيلية (OrderRegistered..) بمجرد ما النظام الجديد يشتغل فعليًا، مش بإعادة عرض
// تاريخ محاسبي قديم (نفس فلسفة سكريبت استيراد المشتريات - "الرصيد الافتتاحي بيغطي الأثر التاريخي").
//
// عملية على مرحلتين عمدًا: مرحلة أولى بتسجل/تحدّث كل الحسابات من غير parent_account_id (عشان لسه
// مفيش ضمان إن الأب اتسجل قبل الابن)، ومرحلة تانية بتربط parent_account_id لما كل الـUUIDs تبقى جاهزة.
import "dotenv/config";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselyAccountRepository } from "../src/contexts/accounting/infrastructure/persistence/kysely-account.repository";
import { KyselyBranchRepository } from "../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { Account } from "../src/contexts/accounting/domain/account.aggregate";

interface LegacyAccountRow {
  id: number;
  code: string;
  name: string;
  account_type: string;
  parent_account_id: number | null;
  branch_id: number | null;
  is_active: boolean;
  is_system_account: boolean;
}

export interface ImportCounts {
  created: number;
  updated: number;
  skipped: number;
  parentsLinked: number;
}

export async function importAccountingFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<ImportCounts> {
  const accountRepo = new KyselyAccountRepository(neoDb);
  const branchRepo = new KyselyBranchRepository(neoDb);
  const { rows } = await legacyPool.query<LegacyAccountRow>(
    `SELECT id, code, name, account_type, parent_account_id, branch_id, is_active, is_system_account
     FROM accounts ORDER BY id`
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const legacyIdToNewId = new Map<number, string>();

  // مرحلة 1: تسجيل/تحديث كل حساب من غير parent_account_id
  for (const row of rows) {
    const branchId = row.branch_id != null ? (await branchRepo.findByLegacyBranchId(row.branch_id))?.id ?? null : null;

    const existing = await accountRepo.findByLegacyAccountId(row.id);
    if (existing) {
      try {
        existing.updateDetails({
          name: row.name,
          accountType: row.account_type,
          branchId,
          isActive: row.is_active,
          isSystemAccount: row.is_system_account,
        });
        await accountRepo.save(existing);
        legacyIdToNewId.set(row.id, existing.id);
        updated++;
      } catch (err) {
        console.warn(`⚠ تخطّي تحديث حساب legacy_id=${row.id} (${row.code}): ${(err as Error).message}`);
        skipped++;
      }
      continue;
    }

    try {
      const account = Account.register({
        code: row.code,
        name: row.name,
        accountType: row.account_type,
        branchId,
        isSystemAccount: row.is_system_account,
        legacyAccountId: row.id,
      });
      if (!row.is_active) account.deactivate();
      await accountRepo.save(account);
      legacyIdToNewId.set(row.id, account.id);
      created++;
    } catch (err) {
      console.warn(`⚠ تخطّي حساب legacy_id=${row.id} (${row.code}): ${(err as Error).message}`);
      skipped++;
    }
  }

  // مرحلة 2: ربط parent_account_id دلوقتي إن كل الـUUIDs جاهزة
  let parentsLinked = 0;
  for (const row of rows) {
    if (row.parent_account_id == null) continue;
    const newId = legacyIdToNewId.get(row.id);
    const parentNewId = legacyIdToNewId.get(row.parent_account_id);
    if (!newId || !parentNewId) continue;

    const account = await accountRepo.findById(newId);
    if (!account || account.parentAccountId === parentNewId) continue;
    account.updateDetails({ name: account.name, accountType: account.accountType, parentAccountId: parentNewId });
    await accountRepo.save(account);
    parentsLinked++;
  }

  return { created, updated, skipped, parentsLinked };
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl }) }) });

  const result = await importAccountingFromLegacy(legacyPool, neoDb);
  console.log(
    `✅ الاستيراد خلص: ${result.created} جديد، ${result.updated} اتحدّث، ${result.parentsLinked} علاقة أب اترّبطت، ${result.skipped} اتخطّى`
  );

  await legacyPool.end();
  await neoDb.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ فشل الاستيراد:", err);
    process.exit(1);
  });
}
