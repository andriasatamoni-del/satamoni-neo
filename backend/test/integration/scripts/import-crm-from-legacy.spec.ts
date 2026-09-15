import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { importCrmFromLegacy } from "../../../scripts/import-crm-from-legacy";
import { KyselyUserRepository } from "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository";
import { KyselyComplaintRepository } from "../../../src/contexts/crm/infrastructure/persistence/kysely-complaint.repository";
import { KyselyCustomerFollowupRepository } from "../../../src/contexts/crm/infrastructure/persistence/kysely-customer-followup.repository";
import { User } from "../../../src/contexts/identity-access/domain/user.aggregate";

const LEGACY_FIXTURE_URL =
  process.env.LEGACY_FIXTURE_DATABASE_URL || "postgresql://postgres:test123@localhost:5432/satamoni_legacy_fixture_test";

describe("importCrmFromLegacy", () => {
  let legacyPool: Pool;
  let neoDb: Kysely<Database>;
  let userRepo: KyselyUserRepository;
  let followupRepo: KyselyCustomerFollowupRepository;
  let complaintRepo: KyselyComplaintRepository;
  let calledById: string;

  beforeAll(async () => {
    legacyPool = new Pool({ connectionString: LEGACY_FIXTURE_URL });
    await legacyPool.query("DROP TABLE IF EXISTS customer_followups, customer_complaints, whatsapp_complaints");
    await legacyPool.query(`
      CREATE TABLE customer_followups (
        id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE, branch_id INTEGER,
        customer_phone TEXT NOT NULL, call_result TEXT NOT NULL,
        satisfaction_rating TEXT, notes TEXT, has_complaint BOOLEAN NOT NULL DEFAULT FALSE,
        called_by INTEGER, called_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await legacyPool.query(`
      CREATE TABLE customer_complaints (
        id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, branch_id INTEGER,
        customer_phone TEXT NOT NULL, followup_id INTEGER, category TEXT NOT NULL,
        description TEXT, status TEXT NOT NULL DEFAULT 'open', resolution_notes TEXT,
        created_by INTEGER, resolved_by INTEGER, resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await legacyPool.query(`
      CREATE TABLE whatsapp_complaints (
        id SERIAL PRIMARY KEY, customer_phone TEXT NOT NULL, order_id INTEGER,
        category TEXT NOT NULL DEFAULT 'other', description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open', resolution_notes TEXT,
        assigned_to INTEGER, resolved_by INTEGER, resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    neoDb = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    userRepo = new KyselyUserRepository(neoDb);
    followupRepo = new KyselyCustomerFollowupRepository(neoDb);
    complaintRepo = new KyselyComplaintRepository(neoDb);

    // بتصفير الجدولين هنا (مش بس afterEach) لأن ملفات اختبار تانية (زي crm.e2e.spec.ts) ممكن تكون
    // سابت صفوف ورا في نفس قاعدة الاختبار المشتركة - عايزين نبدأ من صفحة فاضية مضمونة
    await sql`DELETE FROM complaints`.execute(neoDb);
    await sql`DELETE FROM customer_followups`.execute(neoDb);

    // يوزر مستورد مسبقًا (زي ما هيحصل فعليًا - المستخدمين بيتستوردوا قبل الـCRM) بـlegacy_user_id
    // يطابق called_by/created_by في بيانات الـfixture تحت
    const calledByUser = User.register({
      name: "كول سنتر مستورد", email: "callcenter-import@legacy.test", passwordHash: "h",
      role: "callcenter", legacyUserId: 900,
    });
    await userRepo.save(calledByUser);
    calledById = calledByUser.id;
  });

  afterAll(async () => {
    await legacyPool.end();
    // بنشيل اليوزر اللي عملناه هنا عشان ملفات اختبار تانية بتعمل DELETE شامل على جدول users متعتمدش
    // على صف موجود هنا ومربوط بـFK من complaints/customer_followups
    await sql`DELETE FROM users WHERE email = 'callcenter-import@legacy.test'`.execute(neoDb);
    await neoDb.destroy();
  });

  afterEach(async () => {
    await legacyPool.query("DELETE FROM customer_complaints; DELETE FROM whatsapp_complaints; DELETE FROM customer_followups");
    await sql`DELETE FROM complaints`.execute(neoDb);
    await sql`DELETE FROM customer_followups`.execute(neoDb);
  });

  test("بيستورد متابعة وشكوى تليفون مرتبطة ببعض، ومترجم called_by/created_by صح", async () => {
    const followupRow = await legacyPool.query(
      `INSERT INTO customer_followups (order_id, customer_phone, call_result, satisfaction_rating, has_complaint, called_by)
       VALUES (10, '01000000001', 'answered', 'bad', true, 900) RETURNING id`
    );
    await legacyPool.query(
      `INSERT INTO customer_complaints (order_id, customer_phone, followup_id, category, description, created_by)
       VALUES (10, '01000000001', $1, 'late_order', 'اتأخر أوي', 900)`,
      [followupRow.rows[0].id]
    );

    const result = await importCrmFromLegacy(legacyPool, neoDb);
    expect(result.followups).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(result.phoneComplaints).toEqual({ created: 1, updated: 0, skipped: 0 });

    const followup = await followupRepo.findByLegacyOrderId(10);
    expect(followup).not.toBeNull();
    expect(followup!.calledBy).toBe(calledById);

    const complaints = await complaintRepo.list();
    expect(complaints).toHaveLength(1);
    expect(complaints[0].channel).toBe("phone_followup");
    expect(complaints[0].createdBy).toBe(calledById);
    expect(complaints[0].followupId).toBe(followup!.id);
  });

  test("تشغيلة تانية بنفس البيانات - بتحدّث مش تكرر (idempotent)", async () => {
    await legacyPool.query(
      `INSERT INTO customer_followups (order_id, customer_phone, call_result) VALUES (20, '01000000002', 'no_answer')`
    );
    const first = await importCrmFromLegacy(legacyPool, neoDb);
    expect(first.followups.created).toBe(1);

    await legacyPool.query(`UPDATE customer_followups SET call_result = 'answered' WHERE order_id = 20`);
    const second = await importCrmFromLegacy(legacyPool, neoDb);
    expect(second.followups).toEqual({ created: 0, updated: 1, skipped: 0 });

    const followup = await followupRepo.findByLegacyOrderId(20);
    expect(followup!.callResult).toBe("answered");
  });

  test("بيستورد شكوى واتساب بقناة whatsapp وassigned_to مترجم صح", async () => {
    await legacyPool.query(
      `INSERT INTO whatsapp_complaints (customer_phone, order_id, category, description, assigned_to)
       VALUES ('01000000003', 30, 'wrong_item', 'الأوردر غلط', 900)`
    );

    const result = await importCrmFromLegacy(legacyPool, neoDb);
    expect(result.whatsappComplaints).toEqual({ created: 1, updated: 0, skipped: 0 });

    const complaints = await complaintRepo.list();
    expect(complaints).toHaveLength(1);
    expect(complaints[0].channel).toBe("whatsapp");
    expect(complaints[0].assignedTo).toBe(calledById);
    expect(complaints[0].createdBy).toBeNull();
  });

  test("شكوى بنوع غير معروف بتتخطّى من غير ما توقف باقي الاستيراد", async () => {
    await legacyPool.query(
      `INSERT INTO whatsapp_complaints (customer_phone, category, description) VALUES ('01000000004', 'ghost_category', 'وصف')`
    );
    await legacyPool.query(
      `INSERT INTO whatsapp_complaints (customer_phone, category, description) VALUES ('01000000005', 'other', 'وصف صحيح')`
    );

    const result = await importCrmFromLegacy(legacyPool, neoDb);
    expect(result.whatsappComplaints).toEqual({ created: 1, updated: 0, skipped: 1 });
  });

  test("legacy_complaint_id بيتفرق بين customer_complaints وwhatsapp_complaints لو نفس الرقم", async () => {
    // كل جدول عنده SERIAL منفصل - ممكن الاتنين يطلعوا id=1 - لازم النظام الجديد يفرّق بينهم صح
    await legacyPool.query(
      `INSERT INTO customer_complaints (order_id, customer_phone, category) VALUES (40, '01000000006', 'other')`
    );
    await legacyPool.query(
      `INSERT INTO whatsapp_complaints (customer_phone, category, description) VALUES ('01000000007', 'other', 'وصف')`
    );

    const result = await importCrmFromLegacy(legacyPool, neoDb);
    expect(result.phoneComplaints.created).toBe(1);
    expect(result.whatsappComplaints.created).toBe(1);

    const complaints = await complaintRepo.list();
    expect(complaints).toHaveLength(2);
    expect(new Set(complaints.map((c) => c.channel))).toEqual(new Set(["phone_followup", "whatsapp"]));
  });
});
