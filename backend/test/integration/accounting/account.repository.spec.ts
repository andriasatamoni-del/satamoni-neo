import type { Database } from "../../../src/shared/database/database.token";
import { AccountRepository } from "../../../src/contexts/accounting/infrastructure/persistence/account.repository";
import { Account } from "../../../src/contexts/accounting/domain/account.aggregate";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { accounts } from "../../../src/contexts/accounting/infrastructure/persistence/accounting.tables";

describe("AccountRepository", () => {
  let db: Database;
  let repo: AccountRepository;

  beforeAll(() => {
    db = createScriptDb(process.env.DATABASE_URL as string);
    repo = new AccountRepository(db);
  });

  afterAll(async () => {
    await closeScriptDb(db);
  });

  afterEach(async () => {
    await db.delete(accounts);
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
