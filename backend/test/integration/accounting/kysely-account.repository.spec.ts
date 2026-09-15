import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyAccountRepository } from "../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository";
import { Account } from "../../../src/contexts/accounting/domain/account.aggregate";

describe("KyselyAccountRepository", () => {
  let db: Kysely<Database>;
  let repo: KyselyAccountRepository;

  beforeAll(() => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    repo = new KyselyAccountRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    await sql`DELETE FROM accounts`.execute(db);
  });

  test("save بيسجّل حساب جديد، وfindByCode بيرجّعه بنفس البيانات", async () => {
    const account = Account.register({ code: "1010-جست", name: "الصندوق", accountType: "ASSET" });
    await repo.save(account);
    expect((await repo.findByCode("1010-جست"))?.name).toBe("الصندوق");
  });

  test("existsByCode وfindByLegacyAccountId بيشتغلوا صح", async () => {
    const account = Account.register({ code: "4010-جست", name: "إيراد المبيعات", accountType: "REVENUE", legacyAccountId: 99 });
    await repo.save(account);
    expect(await repo.existsByCode("4010-جست")).toBe(true);
    expect((await repo.findByLegacyAccountId(99))?.id).toBe(account.id);
  });
});
