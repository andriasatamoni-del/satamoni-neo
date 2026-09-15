import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyBranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";

describe("KyselyBranchRepository", () => {
  let db: Kysely<Database>;
  let repo: KyselyBranchRepository;

  beforeAll(() => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    repo = new KyselyBranchRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    await sql`DELETE FROM branches`.execute(db);
  });

  test("save بيسجّل فرع جديد، وfindById بيرجّعه بنفس البيانات", async () => {
    const branch = Branch.register({ name: "فرع الاختبار", legacyBranchId: 1 });
    await repo.save(branch);

    const found = await repo.findById(branch.id);
    expect(found?.name).toBe("فرع الاختبار");
  });

  test("findByLegacyBranchId بيلاقي الفرع المستورد من الريبو القديم", async () => {
    const branch = Branch.register({ name: "فرع تاني", legacyBranchId: 2 });
    await repo.save(branch);

    expect((await repo.findByLegacyBranchId(2))?.id).toBe(branch.id);
    expect(await repo.findByLegacyBranchId(999)).toBeNull();
  });

  test("save تاني على نفس الـid بيعمل update مش صف جديد", async () => {
    const branch = Branch.register({ name: "فرع", legacyBranchId: 3 });
    await repo.save(branch);
    branch.rename("فرع بعد التعديل");
    await repo.save(branch);

    const all = await repo.list();
    expect(all.filter((b) => b.id === branch.id)).toHaveLength(1);
    expect((await repo.findById(branch.id))?.name).toBe("فرع بعد التعديل");
  });
});
