// استيراد Payment Control من الريبو القديم - طرق الدفع (دليل مرجعي)، الدفعات المقفولة (بحالتها
// التاريخية النهائية بالفعل - أي تعديلات معتمدة قبل كده منعكسة في القيم نفسها)، طلبات التعديل
// (سجل تاريخي/تدقيق بس - مش بيتطبّق تاني على الدفعة، القيم الحالية للدفعة مستوردة جاهزة في نفس
// الخطوة)، وسطور مطابقة كشوف الحساب الخارجية بحالتها (متطابقة/غير متطابقة) زي ما هي.
//
// بيستخدم reconstitute() مباشرة (مش register()) لكل من Payment/PaymentAdjustmentRequest/
// ReconciliationRecord - نفس أسلوب سكريبت استيراد الطلبات بالظبط: عشان نحافظ على الطوابع الزمنية
// وحالة السجل التاريخية بالحرف (register() بيفرض "الآن"/حالة ابتدائية مش مناسبة لاستيراد تاريخي).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselyPaymentMethodRepository } from "../src/contexts/payment-control/infrastructure/persistence/kysely-payment-method.repository";
import { KyselyPaymentRepository } from "../src/contexts/payment-control/infrastructure/persistence/kysely-payment.repository";
import { KyselyPaymentAdjustmentRequestRepository } from "../src/contexts/payment-control/infrastructure/persistence/kysely-payment-adjustment-request.repository";
import { KyselyReconciliationRecordRepository } from "../src/contexts/payment-control/infrastructure/persistence/kysely-reconciliation-record.repository";
import { KyselyBranchRepository } from "../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { KyselyOrderRepository } from "../src/contexts/orders/infrastructure/persistence/kysely-order.repository";
import { KyselyUserRepository } from "../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository";
import { PaymentMethod, type PaymentMethodKind, type SettlementChannel } from "../src/contexts/payment-control/domain/payment-method.aggregate";
import { Payment } from "../src/contexts/payment-control/domain/payment.aggregate";
import { PaymentAdjustmentRequest, type AdjustmentRequestStatus } from "../src/contexts/payment-control/domain/payment-adjustment-request.aggregate";
import { ReconciliationRecord, type MatchStatus, type ReconciliationSource } from "../src/contexts/payment-control/domain/reconciliation-record.aggregate";

interface LegacyPaymentMethodRow { id: number; name: string; kind: string; enabled: boolean; settlement_channel: string | null; }
interface LegacyPaymentRow {
  id: number; order_id: number; branch_id: number; payment_method_id: number; method_kind: string;
  settlement_channel: string | null; amount: string; locked_at: Date; locked_by: number | null;
}
interface LegacyAdjustmentRequestRow {
  id: number; payment_id: number; requested_by: number | null; requested_at: Date; reason: string | null;
  proposed_payment_method_id: number | null; proposed_amount: string | null; amount_delta: string;
  status: string; decided_by: number | null; decided_at: Date | null;
}
interface LegacyReconciliationRecordRow {
  id: number; branch_id: number | null; source: string; external_reference: string | null;
  external_amount: string; external_date: Date; matched_payment_id: number | null; match_status: string;
  notes: string | null; entered_by: number | null; entered_at: Date;
}

export interface ImportCounts { created: number; updated: number; skipped: number; }
export interface PaymentControlImportResult {
  paymentMethods: ImportCounts;
  payments: ImportCounts;
  adjustmentRequests: ImportCounts;
  reconciliationRecords: ImportCounts;
}

export async function importPaymentControlFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<PaymentControlImportResult> {
  const methodRepo = new KyselyPaymentMethodRepository(neoDb);
  const paymentRepo = new KyselyPaymentRepository(neoDb);
  const adjustmentRepo = new KyselyPaymentAdjustmentRequestRepository(neoDb);
  const reconciliationRepo = new KyselyReconciliationRecordRepository(neoDb);
  const branchRepo = new KyselyBranchRepository(neoDb);
  const orderRepo = new KyselyOrderRepository(neoDb);
  const userRepo = new KyselyUserRepository(neoDb);

  const branchIdCache = new Map<number, string | null>();
  async function resolveBranchId(legacyId: number): Promise<string | null> {
    if (!branchIdCache.has(legacyId)) branchIdCache.set(legacyId, (await branchRepo.findByLegacyBranchId(legacyId))?.id ?? null);
    return branchIdCache.get(legacyId)!;
  }
  const userIdCache = new Map<number, string | null>();
  async function resolveUserId(legacyId: number | null): Promise<string | null> {
    if (legacyId == null) return null;
    if (!userIdCache.has(legacyId)) userIdCache.set(legacyId, (await userRepo.findByLegacyUserId(legacyId))?.id ?? null);
    return userIdCache.get(legacyId)!;
  }
  const methodIdCache = new Map<number, PaymentMethod | null>();
  async function resolveMethod(legacyId: number): Promise<PaymentMethod | null> {
    if (!methodIdCache.has(legacyId)) methodIdCache.set(legacyId, await methodRepo.findByLegacyPaymentMethodId(legacyId));
    return methodIdCache.get(legacyId)!;
  }

  // 1) طرق الدفع - دليل مرجعي، مفيش اعتماديات
  const paymentMethods: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: methodRows } = await legacyPool.query<LegacyPaymentMethodRow>(
    "SELECT id, name, kind, enabled, settlement_channel FROM payment_methods ORDER BY id"
  );
  for (const row of methodRows) {
    const existing = await methodRepo.findByLegacyPaymentMethodId(row.id);
    try {
      if (existing) {
        existing.updateDetails({ name: row.name, kind: row.kind, settlementChannel: row.settlement_channel, isActive: row.enabled });
        await methodRepo.save(existing);
        paymentMethods.updated++;
      } else {
        const method = PaymentMethod.register({ name: row.name, kind: row.kind, settlementChannel: row.settlement_channel, legacyPaymentMethodId: row.id });
        if (!row.enabled) method.deactivate();
        await methodRepo.save(method);
        paymentMethods.created++;
      }
    } catch (err) {
      console.warn(`⚠ تخطّي طريقة دفع legacy_id=${row.id} (${row.name}): ${(err as Error).message}`);
      paymentMethods.skipped++;
    }
  }

  // 2) الدفعات المقفولة - بحالتها التاريخية النهائية (أي تعديل معتمد قبل كده منعكس في القيم نفسها بالفعل)
  const payments: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: paymentRows } = await legacyPool.query<LegacyPaymentRow>(
    "SELECT id, order_id, branch_id, payment_method_id, method_kind, settlement_channel, amount, locked_at, locked_by FROM payments ORDER BY id"
  );
  for (const row of paymentRows) {
    const order = await orderRepo.findByLegacyOrderId(row.order_id);
    const branchId = await resolveBranchId(row.branch_id);
    const method = await resolveMethod(row.payment_method_id);
    if (!order || !branchId || !method) {
      console.warn(`⚠ تخطّي دفعة legacy_id=${row.id} - الطلب/الفرع/طريقة الدفع مش مستوردين لسه`);
      payments.skipped++;
      continue;
    }

    const existing = await paymentRepo.findByLegacyPaymentId(row.id);
    const payment = Payment.reconstitute(existing?.id ?? randomUUID(), {
      orderId: order.id,
      branchId,
      paymentMethodId: method.id,
      methodKind: row.method_kind as PaymentMethodKind,
      settlementChannel: row.settlement_channel as SettlementChannel | null,
      amount: Number(row.amount),
      lockedAt: row.locked_at,
      lockedBy: await resolveUserId(row.locked_by),
      legacyPaymentId: row.id,
      createdAt: row.locked_at,
    });
    await paymentRepo.save(payment);
    if (existing) payments.updated++;
    else payments.created++;
  }

  // 3) طلبات التعديل - سجل تاريخي/تدقيق بس، مش بيتطبّق تاني على الدفعة (خطوة 2 فوق بتغطي الأثر النهائي)
  const adjustmentRequests: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: adjustmentRows } = await legacyPool.query<LegacyAdjustmentRequestRow>(
    `SELECT id, payment_id, requested_by, requested_at, reason, proposed_payment_method_id, proposed_amount,
            amount_delta, status, decided_by, decided_at
     FROM payment_adjustment_requests ORDER BY id`
  );
  for (const row of adjustmentRows) {
    const payment = await paymentRepo.findByLegacyPaymentId(row.payment_id);
    if (!payment) {
      console.warn(`⚠ تخطّي طلب تعديل legacy_id=${row.id} - الدفعة الأصلية مش مستوردة لسه`);
      adjustmentRequests.skipped++;
      continue;
    }
    const proposedMethod = row.proposed_payment_method_id != null ? await resolveMethod(row.proposed_payment_method_id) : null;

    const existing = await adjustmentRepo.findByLegacyAdjustmentRequestId(row.id);
    const request = PaymentAdjustmentRequest.reconstitute(existing?.id ?? randomUUID(), {
      paymentId: payment.id,
      requestedBy: await resolveUserId(row.requested_by),
      requestedAt: row.requested_at,
      reason: row.reason,
      proposedPaymentMethodId: proposedMethod?.id ?? null,
      proposedAmount: row.proposed_amount != null ? Number(row.proposed_amount) : payment.amount,
      amountDelta: Number(row.amount_delta),
      status: row.status as AdjustmentRequestStatus,
      decidedBy: await resolveUserId(row.decided_by),
      decidedAt: row.decided_at,
      legacyAdjustmentRequestId: row.id,
    });
    await adjustmentRepo.save(request);
    if (existing) adjustmentRequests.updated++;
    else adjustmentRequests.created++;
  }

  // 4) سطور مطابقة كشوف الحساب الخارجية - بحالتها (متطابقة/غير متطابقة) زي ما هي
  const reconciliationRecords: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: reconciliationRows } = await legacyPool.query<LegacyReconciliationRecordRow>(
    `SELECT id, branch_id, source, external_reference, external_amount, external_date, matched_payment_id,
            match_status, notes, entered_by, entered_at
     FROM payment_reconciliation_records ORDER BY id`
  );
  for (const row of reconciliationRows) {
    const branchId = row.branch_id != null ? await resolveBranchId(row.branch_id) : null;
    const matchedPayment = row.matched_payment_id != null ? await paymentRepo.findByLegacyPaymentId(row.matched_payment_id) : null;
    if (row.matched_payment_id != null && !matchedPayment) {
      console.warn(`⚠ تخطّي سطر مطابقة legacy_id=${row.id} - الدفعة المتطابقة معاها مش مستوردة لسه`);
      reconciliationRecords.skipped++;
      continue;
    }

    const existing = await reconciliationRepo.findByLegacyReconciliationRecordId(row.id);
    const record = ReconciliationRecord.reconstitute(existing?.id ?? randomUUID(), {
      branchId,
      source: row.source as ReconciliationSource,
      externalReference: row.external_reference,
      externalAmount: Number(row.external_amount),
      externalDate: row.external_date,
      matchedPaymentId: matchedPayment?.id ?? null,
      matchStatus: row.match_status as MatchStatus,
      notes: row.notes,
      enteredBy: await resolveUserId(row.entered_by),
      enteredAt: row.entered_at,
      legacyReconciliationRecordId: row.id,
    });
    await reconciliationRepo.save(record);
    if (existing) reconciliationRecords.updated++;
    else reconciliationRecords.created++;
  }

  return { paymentMethods, payments, adjustmentRequests, reconciliationRecords };
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl }) }) });

  const result = await importPaymentControlFromLegacy(legacyPool, neoDb);
  console.log("✅ الاستيراد خلص:");
  console.log(`  طرق الدفع: ${result.paymentMethods.created} جديد، ${result.paymentMethods.updated} اتحدّث، ${result.paymentMethods.skipped} اتخطّى`);
  console.log(`  الدفعات: ${result.payments.created} جديد، ${result.payments.updated} اتحدّث، ${result.payments.skipped} اتخطّى`);
  console.log(`  طلبات التعديل: ${result.adjustmentRequests.created} جديد، ${result.adjustmentRequests.updated} اتحدّث، ${result.adjustmentRequests.skipped} اتخطّى`);
  console.log(`  سطور المطابقة: ${result.reconciliationRecords.created} جديد، ${result.reconciliationRecords.updated} اتحدّث، ${result.reconciliationRecords.skipped} اتخطّى`);

  await legacyPool.end();
  await neoDb.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ فشل الاستيراد:", err);
    process.exit(1);
  });
}
