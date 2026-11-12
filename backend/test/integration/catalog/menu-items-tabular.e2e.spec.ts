import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { asc, eq, inArray, like } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { menuCategories, menuItems, menuItemVariants, menuPriceHistory } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";

const SUFFIX = "-منيو-جست";
const CATEGORY = `مشويات${SUFFIX}`;
const ADMIN_EMAIL = "admin-menu-tabular@jest.test";
const CASHIER_EMAIL = "cashier-menu-tabular@jest.test";
const HEADER = "اسم الصنف,النوع,القسم,الحجم,السعر,سعر طلبات,نشط";

function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

describe("Menu items import/export - /catalog/items (e2e)", () => {
  let app: INestApplication;
  let db: Database;
  let adminToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get<Database>(DATABASE);

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const hasher = new BcryptPasswordHasher();
    const passwordHash = await hasher.hash("12345678");
    const repo = new UserRepository(db);
    await repo.save(User.register({ name: "أدمن-منيو", email: ADMIN_EMAIL, passwordHash, roles: ["admin"] }));
    await repo.save(User.register({ name: "كاشير-منيو", email: CASHIER_EMAIL, passwordHash, roles: ["cashier"] }));
    const login = (email: string) => request(app.getHttpServer()).post("/auth/login").send({ email, password: "12345678" });
    adminToken = (await login(ADMIN_EMAIL)).body.token;
    cashierToken = (await login(CASHIER_EMAIL)).body.token;

    const category = await request(app.getHttpServer()).post("/catalog/categories").set("Authorization", `Bearer ${adminToken}`).send({ name: CATEGORY });
    expect(category.status).toBe(201);
  });

  afterEach(async () => {
    const items = await db.select({ id: menuItems.id }).from(menuItems).where(like(menuItems.name, `%${SUFFIX}`));
    const itemIds = items.map((item) => item.id);
    if (itemIds.length > 0) {
      const variants = await db.select({ id: menuItemVariants.id }).from(menuItemVariants).where(inArray(menuItemVariants.item_id, itemIds));
      if (variants.length > 0) await db.delete(menuPriceHistory).where(inArray(menuPriceHistory.entity_id, variants.map((v) => v.id)));
      await db.delete(menuItems).where(inArray(menuItems.id, itemIds));
    }
  });

  afterAll(async () => {
    await db.delete(menuCategories).where(like(menuCategories.name, `%${SUFFIX}`));
    await db.delete(users).where(inArray(users.email, [ADMIN_EMAIL, CASHIER_EMAIL]));
    await app.close();
  });

  function upload(content: string, query = "", token = adminToken) {
    return request(app.getHttpServer())
      .post(`/catalog/items/import${query}`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from(content, "utf8"), "menu.csv");
  }

  function download(path: string) {
    return request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${adminToken}`).buffer(true).parse(binaryParser);
  }

  async function storedSizes(): Promise<Array<{ name: string; kind: string; label: string; price: number; talabatPrice: number; isActive: boolean }>> {
    const rows = await db
      .select({
        name: menuItems.name,
        kind: menuItems.kind,
        is_active: menuItems.is_active,
        label: menuItemVariants.label,
        price: menuItemVariants.price,
        talabat_price: menuItemVariants.talabat_price,
      })
      .from(menuItemVariants)
      .innerJoin(menuItems, eq(menuItems.id, menuItemVariants.item_id))
      .where(like(menuItems.name, `%${SUFFIX}`))
      .orderBy(asc(menuItems.name), asc(menuItemVariants.label));
    return rows.map((row) => ({
      name: row.name,
      kind: row.kind,
      label: row.label,
      price: Number(row.price),
      talabatPrice: Number(row.talabat_price),
      isActive: row.is_active,
    }));
  }

  it("creates an item with several sizes and an addon from one file", async () => {
    const res = await upload(
      `${HEADER}\nكفتة${SUFFIX},صنف,${CATEGORY},صغير,50,60,\nكفتة${SUFFIX},صنف,${CATEGORY},كبير,90,100,\nجبنة${SUFFIX},إضافة,,,10,12,\n`
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ committed: true, totalRows: 3, created: 3, updated: 0, unchanged: 0, issueCount: 0 });
    expect(await storedSizes()).toEqual([
      { name: `جبنة${SUFFIX}`, kind: "addon", label: "عادي", price: 10, talabatPrice: 12, isActive: true },
      { name: `كفتة${SUFFIX}`, kind: "item", label: "صغير", price: 50, talabatPrice: 60, isActive: true },
      { name: `كفتة${SUFFIX}`, kind: "item", label: "كبير", price: 90, talabatPrice: 100, isActive: true },
    ]);
  });

  it("updates prices, adds new sizes to existing items and reports unchanged rows", async () => {
    await upload(`${HEADER}\nكفتة${SUFFIX},صنف,${CATEGORY},صغير,50,60,\nكفتة${SUFFIX},صنف,${CATEGORY},كبير,90,100,\n`);
    const res = await upload(
      `${HEADER}\nكفتة${SUFFIX},صنف,${CATEGORY},صغير,55,60,\nكفتة${SUFFIX},صنف,${CATEGORY},كبير,90,100,\nكفتة${SUFFIX},صنف,${CATEGORY},عائلي,150,170,لا\n`
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 0, updated: 2, unchanged: 1 });
    expect(await storedSizes()).toEqual([
      { name: `كفتة${SUFFIX}`, kind: "item", label: "صغير", price: 55, talabatPrice: 60, isActive: false },
      { name: `كفتة${SUFFIX}`, kind: "item", label: "عائلي", price: 150, talabatPrice: 170, isActive: false },
      { name: `كفتة${SUFFIX}`, kind: "item", label: "كبير", price: 90, talabatPrice: 100, isActive: false },
    ]);
  });

  it("rolls back the whole file when a row names an unknown category", async () => {
    const res = await upload(`${HEADER}\nكفتة${SUFFIX},صنف,${CATEGORY},صغير,50,60,\nطرب${SUFFIX},صنف,مش-موجود${SUFFIX},صغير,40,45,\n`);
    expect(res.status).toBe(422);
    expect(res.body.issues[0]).toMatchObject({ row: 3 });
    expect(res.body.issues[0].message).toContain("مش موجود");
    expect(await storedSizes()).toEqual([]);
  });

  it("rejects a size without both prices", async () => {
    const res = await upload(`${HEADER}\nكفتة${SUFFIX},صنف,${CATEGORY},صغير,50,,\n`);
    expect(res.status).toBe(422);
    expect(res.body.issues[0].message).toContain("سعر طلبات");
  });

  it("validates a dry run without writing anything", async () => {
    const res = await upload(`${HEADER}\nكفتة${SUFFIX},صنف,${CATEGORY},صغير,50,60,\n`, "?dryRun=1");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ dryRun: true, committed: false, created: 1, issueCount: 0 });
    expect(await storedSizes()).toEqual([]);
  });

  it("exports one row per size that imports back unchanged", async () => {
    await upload(`${HEADER}\nكفتة${SUFFIX},صنف,${CATEGORY},صغير,50,60,\nكفتة${SUFFIX},صنف,${CATEGORY},كبير,90,100,\n`);
    const exported = await download(`/catalog/items/export?format=csv&q=${encodeURIComponent(SUFFIX)}`);
    expect(exported.status).toBe(200);
    const csv = exported.body.toString("utf8");
    expect(csv).toContain("صغير");
    expect(csv).toContain("كبير");
    expect(csv).toContain(CATEGORY);

    const reimport = await upload(csv);
    expect(reimport.status).toBe(201);
    expect(reimport.body).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
  });

  it("serves the import template and forbids a cashier from importing", async () => {
    const template = await download("/catalog/items/import-template?format=csv");
    expect(template.status).toBe(200);
    expect(template.body.toString("utf8")).toContain("سعر طلبات");

    const res = await upload(`${HEADER}\nكفتة${SUFFIX},صنف,,صغير,50,60,\n`, "", cashierToken);
    expect(res.status).toBe(403);
  });
});
