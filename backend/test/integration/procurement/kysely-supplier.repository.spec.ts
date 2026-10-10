import { Kysely, sql } from "kysely";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselySupplierRepository } from "../../../src/contexts/procurement/infrastructure/persistence/kysely-supplier.repository";
import { Supplier } from "../../../src/contexts/procurement/domain/supplier.aggregate";
import { closeScriptDb, createScriptDb, kyselyOn } from "../../../src/shared/database/script-db";

describe("KyselySupplierRepository", () => {
  let database: ReturnType<typeof createScriptDb>;
  let db: Kysely<Database>;
  let repo: KyselySupplierRepository;

  beforeAll(() => {
    database = createScriptDb(process.env.DATABASE_URL as string);
    db = kyselyOn(database);
    repo = new KyselySupplierRepository(db);
  });

  afterAll(async () => {
    await closeScriptDb(database);
  });

  afterEach(async () => {
    await sql`DELETE FROM suppliers`.execute(db);
  });

  test("save بيسجّل مورد جديد، وfindById بيرجّعه بنفس البيانات", async () => {
    const supplier = Supplier.register({ name: "مورد-جست", phone: "123" });
    await repo.save(supplier);
    const found = await repo.findById(supplier.id);
    expect(found?.name).toBe("مورد-جست");
    expect(found?.phone).toBe("123");
  });

  test("existsByName وfindByLegacySupplierId بيشتغلوا صح", async () => {
    const supplier = Supplier.register({ name: "مورد-تاني-جست", legacySupplierId: 77 });
    await repo.save(supplier);
    expect(await repo.existsByName("مورد-تاني-جست")).toBe(true);
    expect((await repo.findByLegacySupplierId(77))?.id).toBe(supplier.id);
  });

  test("save تاني بيحدّث الحالة صح", async () => {
    const supplier = Supplier.register({ name: "مورد-تالت-جست" });
    await repo.save(supplier);
    supplier.changeStatus("BLOCKED");
    await repo.save(supplier);
    expect((await repo.findById(supplier.id))?.status).toBe("BLOCKED");
  });
});
