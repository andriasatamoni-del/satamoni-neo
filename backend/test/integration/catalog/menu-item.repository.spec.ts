import type { Database } from "../../../src/shared/database/database.token";
import { MenuItemRepository } from "../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository";
import { MenuItem } from "../../../src/contexts/catalog/domain/menu-item.aggregate";
import { closeScriptDb, createScriptDb } from "../../../src/shared/database/script-db";
import { menuItemVariants, menuItems } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";

describe("MenuItemRepository", () => {
  let db: Database;
  let repo: MenuItemRepository;

  beforeAll(() => {
    db = createScriptDb(process.env.DATABASE_URL as string);
    repo = new MenuItemRepository(db);
  });

  afterAll(async () => {
    await closeScriptDb(db);
  });

  afterEach(async () => {
    await db.delete(menuItemVariants);
    await db.delete(menuItems);
  });

  test("save بيسجّل صنف وأحجامه مع بعض، وfindById بيرجّعهم بنفس البيانات", async () => {
    const item = MenuItem.register({ name: "بيتزا-جست" });
    item.addVariant({ label: "وسط", price: 90 });
    item.addVariant({ label: "كبير", price: 120, talabatPrice: 130 });
    await repo.save(item);

    const found = await repo.findById(item.id);
    expect(found?.name).toBe("بيتزا-جست");
    expect(found?.variants).toHaveLength(2);
    expect(found?.variants.find((v) => v.label === "كبير")?.talabatPrice).toBe(130);
  });

  test("findByVariantId بيلاقي الصنف الأب لحجم معيّن", async () => {
    const item = MenuItem.register({ name: "فطير-جست" });
    const variant = item.addVariant({ label: "عادي", price: 60 });
    await repo.save(item);

    const found = await repo.findByVariantId(variant.id);
    expect(found?.id).toBe(item.id);
  });

  test("save تاني بيضيف حجم جديد من غير ما يكرر القديم", async () => {
    const item = MenuItem.register({ name: "برجر-جست" });
    item.addVariant({ label: "سنجل", price: 70 });
    await repo.save(item);

    const reloaded = await repo.findById(item.id);
    reloaded!.addVariant({ label: "دبل", price: 100 });
    await repo.save(reloaded!);

    const final = await repo.findById(item.id);
    expect(final?.variants).toHaveLength(2);
  });

  test("findByLegacyMenuItemId بيلاقي الصنف المستورد", async () => {
    const item = MenuItem.register({ name: "مكرونة-جست", legacyMenuItemId: 321 });
    await repo.save(item);
    expect((await repo.findByLegacyMenuItemId(321))?.id).toBe(item.id);
  });
});
