import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyCustomerFollowupRepository } from "../../../src/contexts/crm/infrastructure/persistence/kysely-customer-followup.repository";
import { CustomerFollowup } from "../../../src/contexts/crm/domain/customer-followup.aggregate";

describe("KyselyCustomerFollowupRepository", () => {
  let db: Kysely<Database>;
  let repo: KyselyCustomerFollowupRepository;

  beforeAll(() => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    repo = new KyselyCustomerFollowupRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    await sql`DELETE FROM complaints`.execute(db);
    await sql`DELETE FROM customer_followups`.execute(db);
  });

  test("save بيسجّل متابعة جديدة، وfindById بيرجّعها بنفس البيانات", async () => {
    const followup = CustomerFollowup.register({
      legacyOrderId: 101,
      customerPhone: "01000000001",
      callResult: "answered",
      satisfactionRating: "good",
    });
    await repo.save(followup);

    const found = await repo.findById(followup.id);
    expect(found).not.toBeNull();
    expect(found!.legacyOrderId).toBe(101);
    expect(found!.callResult).toBe("answered");
    expect(found!.satisfactionRating).toBe("good");
    expect(found!.hasComplaint).toBe(false);
  });

  test("findByLegacyOrderId بيلاقي المتابعة بالأوردر القديم بتاعها", async () => {
    const followup = CustomerFollowup.register({ legacyOrderId: 202, customerPhone: "01000000002", callResult: "no_answer" });
    await repo.save(followup);

    const found = await repo.findByLegacyOrderId(202);
    expect(found?.id).toBe(followup.id);
    expect(await repo.findByLegacyOrderId(999)).toBeNull();
  });

  test("findByLegacyFollowupId بيلاقي المتابعة المستوردة بكود الريبو القديم", () =>
    (async () => {
      const followup = CustomerFollowup.register({ customerPhone: "01000000003", callResult: "answered", legacyFollowupId: 7 });
      await repo.save(followup);
      const found = await repo.findByLegacyFollowupId(7);
      expect(found?.id).toBe(followup.id);
    })());

  test("save تاني على نفس الـid بيعمل update مش صف جديد", async () => {
    const followup = CustomerFollowup.register({ legacyOrderId: 303, customerPhone: "01000000004", callResult: "no_answer" });
    await repo.save(followup);

    followup.recordCall({ callResult: "answered", satisfactionRating: "bad", hasComplaint: true });
    await repo.save(followup);

    const found = await repo.findById(followup.id);
    expect(found!.callResult).toBe("answered");
    expect(found!.hasComplaint).toBe(true);
  });
});
