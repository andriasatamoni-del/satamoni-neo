// NEOCRM-6: استيراد بيانات الـCRM من الريبو القديم (satamoni-backend) لقاعدة satamoni-neo الجديدة.
// بيوحّد جدولين قديمين (customer_complaints + whatsapp_complaints) في جدول complaints واحد بعمود
// channel، زي ما اتخطط في bounded context map (راجع docs/ARCHITECTURE-REFERENCE.md §7 والخطة المعتمدة).
// اتصال قراءة فقط بقاعدة الريبو القديم - مفيش أي INSERT/UPDATE هناك. قابل لإعادة التشغيل بأمان: كل صف
// بيتربط بمصدره (legacy_followup_id، أو legacy_complaint_id+legacy_source لأن الجدولين القدام عندهم
// SERIAL IDs متداخلة) - لو الصف موجود من تشغيلة قبل كده، بيتحدّث (overwrite كامل بحالة الريبو القديم
// الحالية) مش يتكرر.
//
// لازم يشتغل بعد استيراد المستخدمين والفروع (import-users-from-legacy.ts وimport-branches-from-legacy.ts)
// - called_by/created_by/assigned_to/resolved_by بيتترجموا من legacy user id لـUUID الجديد عن طريق
// users.legacy_user_id، وbranch_id بيتترجم عن طريق branches.legacy_branch_id، فلو أي مرجع لسه ما
// اتستوردش، هيترجم NULL بدل ما يوقف الاستيراد كله.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "../src/shared/database/database.types";
import { KyselyUserRepository } from "../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository";
import { KyselyBranchRepository } from "../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { KyselyCustomerFollowupRepository } from "../src/contexts/crm/infrastructure/persistence/kysely-customer-followup.repository";
import { KyselyComplaintRepository } from "../src/contexts/crm/infrastructure/persistence/kysely-complaint.repository";
import { CustomerFollowup, CALL_RESULTS, SATISFACTION_RATINGS } from "../src/contexts/crm/domain/customer-followup.aggregate";
import { Complaint, CATEGORIES, STATUSES } from "../src/contexts/crm/domain/complaint.aggregate";

interface LegacyFollowupRow {
  id: number;
  order_id: number;
  branch_id: number | null;
  customer_phone: string;
  call_result: string;
  satisfaction_rating: string | null;
  notes: string | null;
  has_complaint: boolean;
  called_by: number | null;
  called_at: Date;
}

interface LegacyComplaintRow {
  id: number;
  order_id: number;
  branch_id: number | null;
  customer_phone: string;
  followup_id: number | null;
  category: string;
  description: string | null;
  status: string;
  resolution_notes: string | null;
  created_by: number | null;
  resolved_by: number | null;
  resolved_at: Date | null;
  created_at: Date;
}

interface LegacyWhatsappComplaintRow {
  id: number;
  customer_phone: string;
  order_id: number | null;
  category: string;
  description: string;
  status: string;
  resolution_notes: string | null;
  assigned_to: number | null;
  resolved_by: number | null;
  resolved_at: Date | null;
  created_at: Date;
}

export interface ImportCounts {
  created: number;
  updated: number;
  skipped: number;
}

export interface CrmImportResult {
  followups: ImportCounts;
  phoneComplaints: ImportCounts;
  whatsappComplaints: ImportCounts;
}

export async function importCrmFromLegacy(legacyPool: Pool, neoDb: Kysely<Database>): Promise<CrmImportResult> {
  const userRepo = new KyselyUserRepository(neoDb);
  const branchRepo = new KyselyBranchRepository(neoDb);
  const followupRepo = new KyselyCustomerFollowupRepository(neoDb);
  const complaintRepo = new KyselyComplaintRepository(neoDb);

  const userIdCache = new Map<number, string | null>();
  async function resolveUserId(legacyUserId: number | null): Promise<string | null> {
    if (legacyUserId == null) return null;
    if (userIdCache.has(legacyUserId)) return userIdCache.get(legacyUserId)!;
    const user = await userRepo.findByLegacyUserId(legacyUserId);
    const id = user?.id ?? null;
    userIdCache.set(legacyUserId, id);
    return id;
  }

  const branchIdCache = new Map<number, string | null>();
  async function resolveBranchId(legacyBranchId: number | null): Promise<string | null> {
    if (legacyBranchId == null) return null;
    if (branchIdCache.has(legacyBranchId)) return branchIdCache.get(legacyBranchId)!;
    const branch = await branchRepo.findByLegacyBranchId(legacyBranchId);
    const id = branch?.id ?? null;
    branchIdCache.set(legacyBranchId, id);
    return id;
  }

  // 1) customer_followups - لازم الأول عشان complaints المرتبطة بمكالمة (followup_id) تلاقي الـUUID
  // الجديد بتاعها وقت الاستيراد
  const followupIdMap = new Map<number, string>(); // legacy followup id -> UUID الجديد
  const followups: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: followupRows } = await legacyPool.query<LegacyFollowupRow>(
    `SELECT id, order_id, branch_id, customer_phone, call_result, satisfaction_rating, notes,
            has_complaint, called_by, called_at
     FROM customer_followups ORDER BY id`
  );
  for (const row of followupRows) {
    if (!CALL_RESULTS.includes(row.call_result as (typeof CALL_RESULTS)[number])) {
      console.warn(`⚠ تخطّي متابعة #${row.id} - نتيجة اتصال غير معروفة: ${row.call_result}`);
      followups.skipped++;
      continue;
    }
    if (
      row.satisfaction_rating != null &&
      !SATISFACTION_RATINGS.includes(row.satisfaction_rating as (typeof SATISFACTION_RATINGS)[number])
    ) {
      console.warn(`⚠ تخطّي متابعة #${row.id} - تقييم رضا غير معروف: ${row.satisfaction_rating}`);
      followups.skipped++;
      continue;
    }

    const calledBy = await resolveUserId(row.called_by);
    const branchId = await resolveBranchId(row.branch_id);
    const existing = await followupRepo.findByLegacyFollowupId(row.id);
    const followup = CustomerFollowup.reconstitute(existing ? existing.id : randomUUID(), {
      legacyOrderId: row.order_id,
      branchId,
      customerPhone: row.customer_phone,
      callResult: row.call_result as (typeof CALL_RESULTS)[number],
      satisfactionRating: row.satisfaction_rating as (typeof SATISFACTION_RATINGS)[number] | null,
      notes: row.notes,
      hasComplaint: row.has_complaint,
      calledBy,
      calledAt: row.called_at,
      legacyFollowupId: row.id,
    });
    await followupRepo.save(followup);
    followupIdMap.set(row.id, followup.id);
    existing ? followups.updated++ : followups.created++;
  }

  // 2) customer_complaints -> complaints (channel = phone_followup)
  const phoneComplaints: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: complaintRows } = await legacyPool.query<LegacyComplaintRow>(
    `SELECT id, order_id, branch_id, customer_phone, followup_id, category, description, status,
            resolution_notes, created_by, resolved_by, resolved_at, created_at
     FROM customer_complaints ORDER BY id`
  );
  for (const row of complaintRows) {
    if (!CATEGORIES.includes(row.category as (typeof CATEGORIES)[number])) {
      console.warn(`⚠ تخطّي شكوى #${row.id} - نوع غير معروف: ${row.category}`);
      phoneComplaints.skipped++;
      continue;
    }
    if (!STATUSES.includes(row.status as (typeof STATUSES)[number])) {
      console.warn(`⚠ تخطّي شكوى #${row.id} - حالة غير معروفة: ${row.status}`);
      phoneComplaints.skipped++;
      continue;
    }

    const createdBy = await resolveUserId(row.created_by);
    const resolvedBy = await resolveUserId(row.resolved_by);
    const branchId = await resolveBranchId(row.branch_id);
    const followupId = row.followup_id != null ? (followupIdMap.get(row.followup_id) ?? null) : null;
    const existing = await complaintRepo.findByLegacyComplaintId("customer_complaints", row.id);
    const complaint = Complaint.reconstitute(existing ? existing.id : randomUUID(), {
      channel: "phone_followup",
      legacyOrderId: row.order_id,
      branchId,
      followupId,
      customerPhone: row.customer_phone,
      category: row.category as (typeof CATEGORIES)[number],
      description: row.description,
      status: row.status as (typeof STATUSES)[number],
      resolutionNotes: row.resolution_notes,
      createdBy,
      assignedTo: null,
      resolvedBy,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      legacyComplaintId: row.id,
      legacySource: "customer_complaints",
    });
    await complaintRepo.save(complaint);
    existing ? phoneComplaints.updated++ : phoneComplaints.created++;
  }

  // 3) whatsapp_complaints -> complaints (channel = whatsapp) - جدول شكله شبه مطابق لـcustomer_
  // complaints (راجع تعليق migration 002_create_crm_tables) بس بيستخدم assigned_to مش created_by،
  // ومش لازم يتربط بأوردر (order_id nullable)
  const whatsappComplaints: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  const { rows: whatsappRows } = await legacyPool.query<LegacyWhatsappComplaintRow>(
    `SELECT id, customer_phone, order_id, category, description, status, resolution_notes,
            assigned_to, resolved_by, resolved_at, created_at
     FROM whatsapp_complaints ORDER BY id`
  );
  for (const row of whatsappRows) {
    if (!CATEGORIES.includes(row.category as (typeof CATEGORIES)[number])) {
      console.warn(`⚠ تخطّي شكوى واتساب #${row.id} - نوع غير معروف: ${row.category}`);
      whatsappComplaints.skipped++;
      continue;
    }
    if (!STATUSES.includes(row.status as (typeof STATUSES)[number])) {
      console.warn(`⚠ تخطّي شكوى واتساب #${row.id} - حالة غير معروفة: ${row.status}`);
      whatsappComplaints.skipped++;
      continue;
    }

    const assignedTo = await resolveUserId(row.assigned_to);
    const resolvedBy = await resolveUserId(row.resolved_by);
    const existing = await complaintRepo.findByLegacyComplaintId("whatsapp_complaints", row.id);
    const complaint = Complaint.reconstitute(existing ? existing.id : randomUUID(), {
      channel: "whatsapp",
      legacyOrderId: row.order_id,
      branchId: null,
      followupId: null,
      customerPhone: row.customer_phone,
      category: row.category as (typeof CATEGORIES)[number],
      description: row.description,
      status: row.status as (typeof STATUSES)[number],
      resolutionNotes: row.resolution_notes,
      createdBy: null,
      assignedTo,
      resolvedBy,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      legacyComplaintId: row.id,
      legacySource: "whatsapp_complaints",
    });
    await complaintRepo.save(complaint);
    existing ? whatsappComplaints.updated++ : whatsappComplaints.created++;
  }

  return { followups, phoneComplaints, whatsappComplaints };
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  const neoUrl = process.env.DATABASE_URL;
  if (!legacyUrl) throw new Error("لازم تحدد LEGACY_DATABASE_URL");
  if (!neoUrl) throw new Error("لازم تحدد DATABASE_URL");

  const legacyPool = new Pool({ connectionString: legacyUrl });
  const neoDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: neoUrl }) }) });

  const result = await importCrmFromLegacy(legacyPool, neoDb);
  console.log(
    `✅ الاستيراد خلص:\n` +
      `  متابعات: ${result.followups.created} جديد، ${result.followups.updated} اتحدّث، ${result.followups.skipped} اتخطّى\n` +
      `  شكاوى تليفون: ${result.phoneComplaints.created} جديد، ${result.phoneComplaints.updated} اتحدّث، ${result.phoneComplaints.skipped} اتخطّى\n` +
      `  شكاوى واتساب: ${result.whatsappComplaints.created} جديد، ${result.whatsappComplaints.updated} اتحدّث، ${result.whatsappComplaints.skipped} اتخطّى`
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
