// استيراد المخزون من الريبو القديم - جزئين:
// 1) كتالوج الأصناف (inventory_items) - نقل مباشر زي باقي السكريبتات.
// 2) الأرصدة الحالية (branch_inventory_stock) - مش بيتعمل replay لكل الليدجر التاريخي (inventory_
//    movements في الريبو القديم مربوط بأوردرات/مشتريات/تحويلات لسه معندهاش aggregates حقيقية في
//    النظام الجديد - Orders/Procurement لسه ما اتبنوش). بدل كده، كل رصيد حالي بيتسجل كحركة واحدة نوعها
//    OPENING_BALANCE ("رصيد افتتاحي منقول من النظام القديم بتاريخ الاستيراد") - أسلوب migration
//    قياسي وصحيح: من هنا وطالع، ليدجر النظام الجديد هو مصدر الحقيقة الوحيد والكامل.
// idempotent عن طريق legacy_reference_key فريد لكل (فرع، صنف) - إعادة التشغيل بتتخطى الأرصدة
// اللي اتسجلت قبل كده بدل ما تكرر حركة OPENING_BALANCE تانية فوقها.
import "dotenv/config";
import { Pool } from "pg";
import { pgSslOption } from "../src/shared/database/pg-ssl";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselyInventoryItemRepository } from "../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository";
import { KyselyStockMovementRepository } from "../src/contexts/inventory/infrastructure/persistence/kysely-stock-movement.repository";
import { KyselyBranchRepository } from "../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { InventoryItem, ITEM_TYPES, NEGATIVE_STOCK_POLICIES } from "../src/contexts/inventory/domain/inventory-item.aggregate";
import { StockMovement } from "../src/contexts/inventory/domain/stock-movement.aggregate";

interface LegacyItemRow {
  id: number;
  name: string;
  unit: string;
  unit_cost: string | null;
  item_type: string;
  negative_stock_policy: string;
}

interface LegacyStockRow {
  branch_id: number;
  inventory_item_id: number;
  quantity: string;
}

export interface ImportCounts {
  created: number;
  updated: number;
  skipped: number;
}

export interface InventoryImportResult {
  items: ImportCounts;
  openingBalances: ImportCounts;
}

export async function importInventoryFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<InventoryImportResult> {
  const itemRepo = new KyselyInventoryItemRepository(neoDb);
  const movementRepo = new KyselyStockMovementRepository(neoDb);
  const branchRepo = new KyselyBranchRepository(neoDb);

  const items: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: itemRows } = await legacyPool.query<LegacyItemRow>(
    `SELECT id, name, unit, unit_cost, item_type, negative_stock_policy FROM inventory_items ORDER BY id`
  );

  const itemIdMap = new Map<number, string>(); // legacy inventory_item_id -> UUID الجديد
  for (const row of itemRows) {
    if (!ITEM_TYPES.includes(row.item_type as (typeof ITEM_TYPES)[number])) {
      console.warn(`⚠ تخطّي صنف #${row.id} (${row.name}) - نوع غير معروف: ${row.item_type}`);
      items.skipped++;
      continue;
    }
    if (!NEGATIVE_STOCK_POLICIES.includes(row.negative_stock_policy as (typeof NEGATIVE_STOCK_POLICIES)[number])) {
      console.warn(`⚠ تخطّي صنف #${row.id} (${row.name}) - سياسة رصيد سالب غير معروفة: ${row.negative_stock_policy}`);
      items.skipped++;
      continue;
    }

    const existing = await itemRepo.findByLegacyInventoryItemId(row.id);
    if (existing) {
      existing.updateUnitCost(row.unit_cost != null ? Number(row.unit_cost) : null);
      existing.changeNegativeStockPolicy(row.negative_stock_policy);
      await itemRepo.save(existing);
      itemIdMap.set(row.id, existing.id);
      items.updated++;
    } else {
      const item = InventoryItem.register({
        name: row.name,
        unit: row.unit,
        unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
        itemType: row.item_type,
        negativeStockPolicy: row.negative_stock_policy,
        legacyInventoryItemId: row.id,
      });
      await itemRepo.save(item);
      itemIdMap.set(row.id, item.id);
      items.created++;
    }
  }

  const openingBalances: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: stockRows } = await legacyPool.query<LegacyStockRow>(
    `SELECT branch_id, inventory_item_id, quantity FROM branch_inventory_stock WHERE quantity <> 0 ORDER BY branch_id, inventory_item_id`
  );

  for (const row of stockRows) {
    const newItemId = itemIdMap.get(row.inventory_item_id);
    if (!newItemId) {
      console.warn(`⚠ تخطّي رصيد افتتاحي (فرع #${row.branch_id}، صنف #${row.inventory_item_id}) - الصنف مش مستورد`);
      openingBalances.skipped++;
      continue;
    }
    const branch = await branchRepo.findByLegacyBranchId(row.branch_id);
    if (!branch) {
      console.warn(`⚠ تخطّي رصيد افتتاحي (فرع #${row.branch_id}، صنف #${row.inventory_item_id}) - الفرع مش مستورد`);
      openingBalances.skipped++;
      continue;
    }

    const legacyReferenceKey = `opening_balance:branch:${row.branch_id}:item:${row.inventory_item_id}`;
    if (await movementRepo.findByLegacyReferenceKey(legacyReferenceKey)) {
      openingBalances.updated++; // فعليًا "اتخطّى لأنه موجود بالفعل" - بس بنعده هنا كإشارة "شغال زي المتوقع" مش خطأ
      continue;
    }

    const movement = StockMovement.register({
      inventoryItemId: newItemId,
      branchId: branch.id,
      movementType: "OPENING_BALANCE",
      quantityDelta: Number(row.quantity),
      reason: "رصيد افتتاحي منقول من النظام القديم وقت الاستيراد",
      legacyReferenceKey,
    });
    await movementRepo.recordMovement(movement, { allowNegativeBalance: true });
    openingBalances.created++;
  }

  return { items, openingBalances };
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl, ssl: pgSslOption() });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl, ssl: pgSslOption() }) }) });

  const result = await importInventoryFromLegacy(legacyPool, neoDb);
  console.log(
    `✅ الاستيراد خلص:\n` +
      `  أصناف: ${result.items.created} جديد، ${result.items.updated} اتحدّث، ${result.items.skipped} اتخطّى\n` +
      `  أرصدة افتتاحية: ${result.openingBalances.created} جديد، ${result.openingBalances.updated} موجود بالفعل، ${result.openingBalances.skipped} اتخطّى`
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
