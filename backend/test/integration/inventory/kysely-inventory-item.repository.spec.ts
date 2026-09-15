import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyInventoryItemRepository } from "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository";
import { InventoryItem } from "../../../src/contexts/inventory/domain/inventory-item.aggregate";

describe("KyselyInventoryItemRepository", () => {
  let db: Kysely<Database>;
  let repo: KyselyInventoryItemRepository;

  beforeAll(() => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    repo = new KyselyInventoryItemRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    await sql`DELETE FROM branch_stock_balances`.execute(db);
    await sql`DELETE FROM stock_movements`.execute(db);
    await sql`DELETE FROM inventory_items`.execute(db);
  });

  test("save بيسجّل صنف جديد، وfindById بيرجّعه بنفس البيانات", async () => {
    const item = InventoryItem.register({ name: "دقيق-جست", unit: "كيلو", unitCost: 25.5 });
    await repo.save(item);

    const found = await repo.findById(item.id);
    expect(found?.name).toBe("دقيق-جست");
    expect(found?.unitCost).toBe(25.5);
  });

  test("existsByName وfindByName بيشتغلوا صح", async () => {
    const item = InventoryItem.register({ name: "جبنة-جست", unit: "كيلو" });
    await repo.save(item);
    expect(await repo.existsByName("جبنة-جست")).toBe(true);
    expect(await repo.existsByName("مش-موجود")).toBe(false);
    expect((await repo.findByName("جبنة-جست"))?.id).toBe(item.id);
  });

  test("findByLegacyInventoryItemId بيلاقي الصنف المستورد", async () => {
    const item = InventoryItem.register({ name: "زيت-جست", unit: "لتر", legacyInventoryItemId: 55 });
    await repo.save(item);
    expect((await repo.findByLegacyInventoryItemId(55))?.id).toBe(item.id);
  });

  test("save تاني على نفس الـid بيعمل update مش صف جديد", async () => {
    const item = InventoryItem.register({ name: "سكر-جست", unit: "كيلو" });
    await repo.save(item);
    item.changeNegativeStockPolicy("ALLOW_WITH_APPROVAL");
    item.updateUnitCost(12);
    await repo.save(item);

    const found = await repo.findById(item.id);
    expect(found?.negativeStockPolicy).toBe("ALLOW_WITH_APPROVAL");
    expect(found?.unitCost).toBe(12);
    expect((await repo.list()).filter((i) => i.id === item.id)).toHaveLength(1);
  });
});
