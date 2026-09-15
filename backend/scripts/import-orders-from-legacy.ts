// استيراد الطلبات من الريبو القديم - سجل تاريخي/مرجعي بس (تقارير، تتبّع) - **من غير** أي استهلاك
// مخزون جديد، لنفس السبب بالظبط اللي في import-procurement-from-legacy.ts: الأرصدة الحالية بالفعل
// مستوردة كـ"رصيد افتتاحي" واحد بيعكس أثر كل الطلبات التاريخية دي - استهلاك تاني هنا هيضاعف الخصم.
//
// order_type/status/kitchen_status نفس القيم بالظبط بين النظامين (مصمّمين كده عمدًا) - مفيش تحويل
// حالات مطلوب زي ما حصل مع recipe_versions.status. بنود الطلب اللي بتشاور على كومبو (combo_id) مش
// item_id/variant_id بتتخطّى - الكومبوهات لسه مش موجودة كـaggregate في النظام الجديد.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselyOrderRepository } from "../src/contexts/orders/infrastructure/persistence/kysely-order.repository";
import { KyselyBranchRepository } from "../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { KyselyMenuItemRepository } from "../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository";
import { KyselyUserRepository } from "../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository";
import { Order, ORDER_TYPES, ORDER_STATUSES, KITCHEN_STATUSES } from "../src/contexts/orders/domain/order.aggregate";

interface LegacyOrderRow {
  id: number; branch_id: number | null; order_type: string; table_number: string | null;
  customer_name: string | null; customer_phone: string | null; address_details: string | null;
  subtotal: string; discount: string; total: string; status: string; kitchen_status: string;
  created_by: number | null; created_at: Date;
}
interface LegacyOrderItemRow {
  id: number; order_id: number; item_id: number | null; variant_id: number | null;
  combo_id: number | null; quantity: number; unit_price: string; line_total: string;
}

export interface ImportCounts { created: number; updated: number; skipped: number; }

export async function importOrdersFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<ImportCounts> {
  const orderRepo = new KyselyOrderRepository(neoDb);
  const branchRepo = new KyselyBranchRepository(neoDb);
  const menuItemRepo = new KyselyMenuItemRepository(neoDb);
  const userRepo = new KyselyUserRepository(neoDb);

  const branchIdCache = new Map<number, string | null>();
  async function resolveBranchId(legacyId: number | null): Promise<string | null> {
    if (legacyId == null) return null;
    if (branchIdCache.has(legacyId)) return branchIdCache.get(legacyId)!;
    const branch = await branchRepo.findByLegacyBranchId(legacyId);
    branchIdCache.set(legacyId, branch?.id ?? null);
    return branch?.id ?? null;
  }
  const userIdCache = new Map<number, string | null>();
  async function resolveUserId(legacyId: number | null): Promise<string | null> {
    if (legacyId == null) return null;
    if (userIdCache.has(legacyId)) return userIdCache.get(legacyId)!;
    const user = await userRepo.findByLegacyUserId(legacyId);
    userIdCache.set(legacyId, user?.id ?? null);
    return user?.id ?? null;
  }
  // menu_item_variants مالهاش legacy_menu_item_id مباشر - لازم نلاقي الصنف الأب الأول (findByLegacyMenuItemId)
  // ثم نلاقي فيه الحجم بالـlegacyVariantId
  const variantIdCache = new Map<number, string | null>();
  async function resolveVariantId(legacyVariantId: number, legacyMenuItemId: number | null): Promise<string | null> {
    if (variantIdCache.has(legacyVariantId)) return variantIdCache.get(legacyVariantId)!;
    if (legacyMenuItemId == null) return null;
    const menuItem = await menuItemRepo.findByLegacyMenuItemId(legacyMenuItemId);
    const variant = menuItem?.variants.find((v) => v.legacyVariantId === legacyVariantId);
    variantIdCache.set(legacyVariantId, variant?.id ?? null);
    return variant?.id ?? null;
  }

  const { rows: itemRows } = await legacyPool.query<LegacyOrderItemRow>(
    `SELECT id, order_id, item_id, variant_id, combo_id, quantity, unit_price, line_total FROM order_items ORDER BY id`
  );
  const itemsByOrder = new Map<number, LegacyOrderItemRow[]>();
  for (const it of itemRows) {
    const list = itemsByOrder.get(it.order_id) ?? [];
    list.push(it);
    itemsByOrder.set(it.order_id, list);
  }

  const result: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: orderRows } = await legacyPool.query<LegacyOrderRow>(
    `SELECT id, branch_id, order_type, table_number, customer_name, customer_phone, address_details,
            subtotal, discount, total, status, kitchen_status, created_by, created_at
     FROM orders ORDER BY id`
  );

  for (const row of orderRows) {
    if (!ORDER_TYPES.includes(row.order_type as (typeof ORDER_TYPES)[number])) {
      result.skipped++;
      continue;
    }
    if (!ORDER_STATUSES.includes(row.status as (typeof ORDER_STATUSES)[number])) {
      result.skipped++;
      continue;
    }
    const branchId = await resolveBranchId(row.branch_id);
    if (!branchId) {
      console.warn(`⚠ تخطّي طلب #${row.id} - الفرع مش مستورد`);
      result.skipped++;
      continue;
    }

    const existing = await orderRepo.findByLegacyOrderId(row.id);
    if (existing) {
      result.updated++; // الطلبات التاريخية مبتتغيّرش - بس بنعدّها كإشارة "شغال زي المتوقع"
      continue;
    }

    const lines: { id: string; menuItemId: string; variantId: string; quantity: number; unitPrice: number; lineTotal: number }[] = [];
    for (const item of itemsByOrder.get(row.id) ?? []) {
      if (item.combo_id != null || item.item_id == null || item.variant_id == null) continue; // كومبو - مش مدعوم لسه
      const menuItem = await menuItemRepo.findByLegacyMenuItemId(item.item_id);
      const variantId = await resolveVariantId(item.variant_id, item.item_id);
      if (!menuItem || !variantId) continue;
      lines.push({
        id: randomUUID(), menuItemId: menuItem.id, variantId, quantity: item.quantity,
        unitPrice: Number(item.unit_price), lineTotal: Number(item.line_total),
      });
    }
    if (lines.length === 0) {
      result.skipped++; // مفيش بنود قابلة للاستيراد (كله كومبو، أو أصناف مش مستوردة)
      continue;
    }

    const order = Order.reconstitute(randomUUID(), {
      branchId,
      orderType: row.order_type as (typeof ORDER_TYPES)[number],
      tableNumber: row.table_number,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      addressDetails: row.address_details,
      items: lines,
      subtotal: Number(row.subtotal),
      discount: Number(row.discount),
      total: Number(row.total),
      status: row.status as (typeof ORDER_STATUSES)[number],
      kitchenStatus: KITCHEN_STATUSES.includes(row.kitchen_status as (typeof KITCHEN_STATUSES)[number])
        ? (row.kitchen_status as (typeof KITCHEN_STATUSES)[number])
        : "READY",
      createdBy: await resolveUserId(row.created_by),
      createdAt: row.created_at,
      legacyOrderId: row.id,
    });
    await orderRepo.save(order);
    result.created++;
  }

  return result;
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl }) }) });

  const result = await importOrdersFromLegacy(legacyPool, neoDb);
  console.log(`✅ الاستيراد خلص: ${result.created} جديد، ${result.updated} موجود بالفعل، ${result.skipped} اتخطّى`);

  await legacyPool.end();
  await neoDb.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ فشل الاستيراد:", err);
    process.exit(1);
  });
}
