import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyComplaintRepository } from "../../../src/contexts/crm/infrastructure/persistence/kysely-complaint.repository";
import { Complaint } from "../../../src/contexts/crm/domain/complaint.aggregate";

describe("KyselyComplaintRepository", () => {
  let db: Kysely<Database>;
  let repo: KyselyComplaintRepository;

  beforeAll(() => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    repo = new KyselyComplaintRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    await sql`DELETE FROM complaints`.execute(db);
    await sql`DELETE FROM customer_followups`.execute(db);
  });

  test("save بيسجّل شكوى جديدة وfindById بيرجّعها بنفس البيانات", async () => {
    const complaint = Complaint.register({
      channel: "phone_followup",
      customerPhone: "01000000005",
      category: "late_order",
      createdBy: null,
    });
    await repo.save(complaint);

    const found = await repo.findById(complaint.id);
    expect(found).not.toBeNull();
    expect(found!.channel).toBe("phone_followup");
    expect(found!.category).toBe("late_order");
    expect(found!.status).toBe("open");
  });

  test("list بيفلتر بالحالة صح ومترتب الأحدث الأول", async () => {
    const open = Complaint.register({ channel: "whatsapp", customerPhone: "01000000006", category: "other" });
    const resolved = Complaint.register({
      channel: "whatsapp", customerPhone: "01000000007", category: "other", status: "resolved",
    });
    await repo.save(open);
    await repo.save(resolved);

    const openOnly = await repo.list({ status: "open" });
    expect(openOnly.map((c) => c.id)).toEqual([open.id]);

    const resolvedOnly = await repo.list({ status: "resolved" });
    expect(resolvedOnly.map((c) => c.id)).toEqual([resolved.id]);
  });

  test("findLatestByPhone بيرجّع آخر شكوى مسجّلة لرقم العميل ده", async () => {
    const older = Complaint.register({ channel: "whatsapp", customerPhone: "01000000008", category: "other" });
    await repo.save(older);
    await new Promise((r) => setTimeout(r, 10));
    const newer = Complaint.register({ channel: "whatsapp", customerPhone: "01000000008", category: "quality" });
    await repo.save(newer);

    const latest = await repo.findLatestByPhone("01000000008");
    expect(latest?.id).toBe(newer.id);
    expect(await repo.findLatestByPhone("no-such-phone")).toBeNull();
  });

  test("findByLegacyComplaintId بيفرّق بين نفس الـid الجاي من مصدرين مختلفين", async () => {
    const fromPhone = Complaint.register({
      channel: "phone_followup", customerPhone: "01000000009", category: "other",
      legacyComplaintId: 5, legacySource: "customer_complaints",
    });
    const fromWhatsapp = Complaint.register({
      channel: "whatsapp", customerPhone: "01000000010", category: "other",
      legacyComplaintId: 5, legacySource: "whatsapp_complaints",
    });
    await repo.save(fromPhone);
    await repo.save(fromWhatsapp);

    expect((await repo.findByLegacyComplaintId("customer_complaints", 5))?.id).toBe(fromPhone.id);
    expect((await repo.findByLegacyComplaintId("whatsapp_complaints", 5))?.id).toBe(fromWhatsapp.id);
  });
});
