import { Kysely, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyAccountRepository } from "../../../src/contexts/accounting/infrastructure/persistence/kysely-account.repository";
import { Account } from "../../../src/contexts/accounting/domain/account.aggregate";
import { closeScriptDb, createScriptDb, kyselyOn } from "../../../src/shared/database/script-db";

describe("KyselyAccountRepository", () => {
  let database: ReturnType<typeof createScriptDb>;
  let db: Kysely<Database>;
  let repo: KyselyAccountRepository;

  beforeAll(() => {
    database = createScriptDb(process.env.DATABASE_URL as string);
    db = kyselyOn(database);
    repo = new KyselyAccountRepository(db);
  });

  afterAll(async () => {
    await closeScriptDb(database);
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
