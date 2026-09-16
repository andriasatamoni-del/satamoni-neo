import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyPaymentMethodRepository } from "../../../src/contexts/payment-control/infrastructure/persistence/kysely-payment-method.repository";
import { PaymentMethod } from "../../../src/contexts/payment-control/domain/payment-method.aggregate";

describe("KyselyPaymentMethodRepository", () => {
  let db: Kysely<Database>;
  let repo: KyselyPaymentMethodRepository;

  beforeAll(() => {
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) });
    repo = new KyselyPaymentMethodRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    await sql`DELETE FROM payment_methods`.execute(db);
  });

  test("save بيسجّل طريقة دفع، وfindById بيرجّعها بنفس البيانات", async () => {
    const method = PaymentMethod.register({ name: "فيزا PC-جست", kind: "card_or_wallet", settlementChannel: "visa_pos" });
    await repo.save(method);
    const found = await repo.findById(method.id);
    expect(found?.name).toBe("فيزا PC-جست");
    expect(found?.settlementChannel).toBe("visa_pos");
  });

  test("findByLegacyPaymentMethodId بيلاقيها صح", async () => {
    const method = PaymentMethod.register({ name: "كاش-جست", kind: "cash", legacyPaymentMethodId: 777 });
    await repo.save(method);
    const found = await repo.findByLegacyPaymentMethodId(777);
    expect(found?.id).toBe(method.id);
  });

  test("save تاني على نفس id بيحدّث مش يكرر", async () => {
    const method = PaymentMethod.register({ name: "كاش-جست", kind: "cash" });
    await repo.save(method);
    method.updateDetails({ name: "كاش-جست معدّل", kind: "cash", isActive: false });
    await repo.save(method);

    const found = await repo.findById(method.id);
    expect(found?.name).toBe("كاش-جست معدّل");
    expect(found?.isActive).toBe(false);
  });
});
