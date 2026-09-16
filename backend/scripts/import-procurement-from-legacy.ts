// استيراد المشتريات من الريبو القديم - موردين + أوامر شراء رسمية + أذون استلام. مؤجّل: طلبات الشراء
// (purchase_requests قبل الأمر)، المرتجعات، فواتير/مدفوعات/كشف حساب الموردين، ومسار "المشترى النقدي
// السريع" (purchases/purchase_items) - النظام الجديد صمم GoodsReceipt عشان يوحّد المسارين مستقبلًا، بس
// استيراد التاريخ القديم بتاعه مؤجّل لسلايس تاني (الريبو القديم لسه موجود كمرجع كامل ليه).
//
// مهم: أذون الاستلام المستوردة هنا بتتسجّل بحالتها التاريخية (DRAFT أو CONFIRMED) من غير ما ترحّل أي
// حركة مخزون جديدة - رصيد المخزون الحالي بالفعل مستورد كـ"رصيد افتتاحي" واحد في import-inventory-
// from-legacy.ts، وده أصلًا بيعكس أثر كل الاستلامات التاريخية دي. لو رحّلنا حركة تانية هنا كمان، الرصيد
// هيتحسب مرتين. الاستيراد هنا للسجل التاريخي/المرجعي بس (تقارير، تتبّع، audit)، مش لتحريك رصيد فعلي.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { pgSslOption } from "../src/shared/database/pg-ssl";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselySupplierRepository } from "../src/contexts/procurement/infrastructure/persistence/kysely-supplier.repository";
import { KyselyPurchaseOrderRepository } from "../src/contexts/procurement/infrastructure/persistence/kysely-purchase-order.repository";
import { KyselyGoodsReceiptRepository } from "../src/contexts/procurement/infrastructure/persistence/kysely-goods-receipt.repository";
import { KyselyBranchRepository } from "../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { KyselyInventoryItemRepository } from "../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository";
import { KyselyUserRepository } from "../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository";
import { Supplier, SUPPLIER_STATUSES } from "../src/contexts/procurement/domain/supplier.aggregate";
import { PurchaseOrder } from "../src/contexts/procurement/domain/purchase-order.aggregate";
import { GoodsReceipt } from "../src/contexts/procurement/domain/goods-receipt.aggregate";

interface LegacySupplierRow {
  id: number; name: string; contact_person: string | null; phone: string | null; email: string | null;
  address: string | null; payment_terms: string | null; status: string;
}
interface LegacyPurchaseOrderRow { id: number; supplier_id: number; branch_id: number; status: string; created_by: number | null; created_at: Date; }
interface LegacyPurchaseOrderItemRow { id: number; purchase_order_id: number; inventory_item_id: number; ordered_quantity: string; unit_price: string; }
interface LegacyGoodsReceiptRow {
  id: number; purchase_order_id: number; supplier_id: number; branch_id: number; status: string;
  received_by: number | null; created_at: Date; posted_at: Date | null;
}
interface LegacyGoodsReceiptItemRow { id: number; goods_receipt_id: number; inventory_item_id: number; accepted_quantity: string; unit_price: string; }

export interface ImportCounts { created: number; updated: number; skipped: number; }
export interface ProcurementImportResult {
  suppliers: ImportCounts;
  purchaseOrders: ImportCounts;
  goodsReceipts: ImportCounts;
}

export async function importProcurementFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<ProcurementImportResult> {
  const supplierRepo = new KyselySupplierRepository(neoDb);
  const purchaseOrderRepo = new KyselyPurchaseOrderRepository(neoDb);
  const goodsReceiptRepo = new KyselyGoodsReceiptRepository(neoDb);
  const branchRepo = new KyselyBranchRepository(neoDb);
  const inventoryRepo = new KyselyInventoryItemRepository(neoDb);
  const userRepo = new KyselyUserRepository(neoDb);

  const branchIdCache = new Map<number, string | null>();
  async function resolveBranchId(legacyId: number): Promise<string | null> {
    if (branchIdCache.has(legacyId)) return branchIdCache.get(legacyId)!;
    const branch = await branchRepo.findByLegacyBranchId(legacyId);
    branchIdCache.set(legacyId, branch?.id ?? null);
    return branch?.id ?? null;
  }
  const itemIdCache = new Map<number, string | null>();
  async function resolveItemId(legacyId: number): Promise<string | null> {
    if (itemIdCache.has(legacyId)) return itemIdCache.get(legacyId)!;
    const item = await inventoryRepo.findByLegacyInventoryItemId(legacyId);
    itemIdCache.set(legacyId, item?.id ?? null);
    return item?.id ?? null;
  }
  const userIdCache = new Map<number, string | null>();
  async function resolveUserId(legacyId: number | null): Promise<string | null> {
    if (legacyId == null) return null;
    if (userIdCache.has(legacyId)) return userIdCache.get(legacyId)!;
    const user = await userRepo.findByLegacyUserId(legacyId);
    userIdCache.set(legacyId, user?.id ?? null);
    return user?.id ?? null;
  }

  // 1) الموردين
  const suppliers: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const supplierIdMap = new Map<number, string>();
  const { rows: supplierRows } = await legacyPool.query<LegacySupplierRow>(
    `SELECT id, name, contact_person, phone, email, address, payment_terms, status FROM suppliers ORDER BY id`
  );
  for (const row of supplierRows) {
    if (!SUPPLIER_STATUSES.includes(row.status as (typeof SUPPLIER_STATUSES)[number])) {
      console.warn(`⚠ تخطّي مورد #${row.id} (${row.name}) - حالة غير معروفة: ${row.status}`);
      suppliers.skipped++;
      continue;
    }
    const existing = await supplierRepo.findByLegacySupplierId(row.id);
    const supplier =
      existing ??
      Supplier.register({
        name: row.name, contactPerson: row.contact_person, phone: row.phone, email: row.email,
        address: row.address, paymentTerms: row.payment_terms, legacySupplierId: row.id,
      });
    if (existing) {
      existing.updateDetails({
        contactPerson: row.contact_person, phone: row.phone, email: row.email, address: row.address, paymentTerms: row.payment_terms,
      });
    }
    supplier.changeStatus(row.status);
    await supplierRepo.save(supplier);
    supplierIdMap.set(row.id, supplier.id);
    existing ? suppliers.updated++ : suppliers.created++;
  }

  // 2) أوامر الشراء الرسمية
  const purchaseOrders: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: poRows } = await legacyPool.query<LegacyPurchaseOrderRow>(
    `SELECT id, supplier_id, branch_id, status, created_by, created_at FROM purchase_orders ORDER BY id`
  );
  const { rows: poItemRows } = await legacyPool.query<LegacyPurchaseOrderItemRow>(
    `SELECT id, purchase_order_id, inventory_item_id, ordered_quantity, unit_price FROM purchase_order_items ORDER BY id`
  );
  const poItemsByOrder = new Map<number, LegacyPurchaseOrderItemRow[]>();
  for (const it of poItemRows) {
    const list = poItemsByOrder.get(it.purchase_order_id) ?? [];
    list.push(it);
    poItemsByOrder.set(it.purchase_order_id, list);
  }
  // النظام الجديد عنده 4 حالات بس (DRAFT/SENT/RECEIVED/CANCELLED) مقابل 7 في الريبو القديم
  // (DRAFT/SUBMITTED/APPROVED/PARTIALLY_RECEIVED/FULLY_RECEIVED/CLOSED/CANCELLED)
  const poStatusMap: Record<string, string> = {
    DRAFT: "DRAFT", SUBMITTED: "SENT", APPROVED: "SENT", PARTIALLY_RECEIVED: "SENT",
    FULLY_RECEIVED: "RECEIVED", CLOSED: "RECEIVED", CANCELLED: "CANCELLED",
  };
  for (const row of poRows) {
    const supplierId = supplierIdMap.get(row.supplier_id);
    const branchId = await resolveBranchId(row.branch_id);
    if (!supplierId || !branchId) {
      console.warn(`⚠ تخطّي أمر شراء #${row.id} - المورد أو الفرع مش مستورد`);
      purchaseOrders.skipped++;
      continue;
    }
    const lines: { inventoryItemId: string; quantity: number; unitPrice: number }[] = [];
    for (const item of poItemsByOrder.get(row.id) ?? []) {
      const inventoryItemId = await resolveItemId(item.inventory_item_id);
      if (!inventoryItemId) continue;
      lines.push({ inventoryItemId, quantity: Number(item.ordered_quantity), unitPrice: Number(item.unit_price) });
    }
    if (lines.length === 0) {
      console.warn(`⚠ تخطّي أمر شراء #${row.id} - مفيش بنود قابلة للاستيراد`);
      purchaseOrders.skipped++;
      continue;
    }

    const existing = await purchaseOrderRepo.findByLegacyPurchaseOrderId(row.id);
    if (existing) {
      existing.setStatus(poStatusMap[row.status] ?? "DRAFT");
      await purchaseOrderRepo.save(existing);
      purchaseOrders.updated++;
    } else {
      const order = PurchaseOrder.register({
        supplierId, branchId, lines, createdBy: await resolveUserId(row.created_by), legacyPurchaseOrderId: row.id,
      });
      order.setStatus(poStatusMap[row.status] ?? "DRAFT");
      await purchaseOrderRepo.save(order);
      purchaseOrders.created++;
    }
  }

  // 3) أذون الاستلام - بتتسجّل بحالتها التاريخية من غير ترحيل حركة مخزون جديدة (راجع تعليق الملف)
  const goodsReceipts: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: grRows } = await legacyPool.query<LegacyGoodsReceiptRow>(
    `SELECT id, purchase_order_id, supplier_id, branch_id, status, received_by, created_at, posted_at FROM goods_receipts ORDER BY id`
  );
  const { rows: grItemRows } = await legacyPool.query<LegacyGoodsReceiptItemRow>(
    `SELECT id, goods_receipt_id, inventory_item_id, accepted_quantity, unit_price FROM goods_receipt_items ORDER BY id`
  );
  const grItemsByReceipt = new Map<number, LegacyGoodsReceiptItemRow[]>();
  for (const it of grItemRows) {
    const list = grItemsByReceipt.get(it.goods_receipt_id) ?? [];
    list.push(it);
    grItemsByReceipt.set(it.goods_receipt_id, list);
  }
  for (const row of grRows) {
    if (row.status === "CANCELLED") {
      goodsReceipts.skipped++; // مفيهاش أثر مخزون خالص في الأصل - مفيش داعي نستوردها
      continue;
    }
    const branchId = await resolveBranchId(row.branch_id);
    const supplierId = supplierIdMap.get(row.supplier_id) ?? null;
    if (!branchId) {
      console.warn(`⚠ تخطّي إذن استلام #${row.id} - الفرع مش مستورد`);
      goodsReceipts.skipped++;
      continue;
    }
    const lines: { inventoryItemId: string; quantity: number; unitCost: number }[] = [];
    for (const item of grItemsByReceipt.get(row.id) ?? []) {
      const inventoryItemId = await resolveItemId(item.inventory_item_id);
      if (!inventoryItemId || Number(item.accepted_quantity) <= 0) continue;
      lines.push({ inventoryItemId, quantity: Number(item.accepted_quantity), unitCost: Number(item.unit_price) });
    }
    if (lines.length === 0) {
      goodsReceipts.skipped++;
      continue;
    }

    const existing = await goodsReceiptRepo.findByLegacyGoodsReceiptId(row.id);
    if (existing) {
      goodsReceipts.updated++; // الحالة التاريخية النهائية مبتتغيّرش بعد الاستيراد الأول
      continue;
    }
    const receivedBy = await resolveUserId(row.received_by);
    const purchaseOrder = await purchaseOrderRepo.findByLegacyPurchaseOrderId(row.purchase_order_id);
    const receipt = GoodsReceipt.reconstitute(randomUUID(), {
      purchaseOrderId: purchaseOrder?.id ?? null,
      supplierId,
      branchId,
      status: row.status === "POSTED" ? "CONFIRMED" : "DRAFT",
      lines: lines.map((l) => ({ id: randomUUID(), ...l })),
      receivedBy,
      createdAt: row.created_at,
      confirmedAt: row.posted_at,
      legacyGoodsReceiptId: row.id,
    });
    await goodsReceiptRepo.save(receipt);
    goodsReceipts.created++;
  }

  return { suppliers, purchaseOrders, goodsReceipts };
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl, ssl: pgSslOption() });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl, ssl: pgSslOption() }) }) });

  const result = await importProcurementFromLegacy(legacyPool, neoDb);
  console.log(
    `✅ الاستيراد خلص:\n` +
      `  موردين: ${result.suppliers.created} جديد، ${result.suppliers.updated} اتحدّث، ${result.suppliers.skipped} اتخطّى\n` +
      `  أوامر شراء: ${result.purchaseOrders.created} جديد، ${result.purchaseOrders.updated} اتحدّث، ${result.purchaseOrders.skipped} اتخطّى\n` +
      `  أذون استلام: ${result.goodsReceipts.created} جديد، ${result.goodsReceipts.updated} موجود بالفعل، ${result.goodsReceipts.skipped} اتخطّى`
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
