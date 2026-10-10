import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// POS category groups: user-defined order (with the "العروض" tab placed among the categories) and archiving a category
// instead of deleting it. Real application, real PostgreSQL.
describe("Catalog - category groups: order + archive (e2e)", () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  const names = { a: "فطير-ترتيب-جست", b: "بيتزا-ترتيب-جست", c: "عروض-قسم-ترتيب-جست" };
  const ids: Record<string, string> = {};
  let itemId: string;

  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const server = () => app.getHttpServer();
  const list = async (query = "") => (await request(server()).get(`/catalog/categories${query}`).set(auth())).body as Array<{ id: string; name: string; displayOrder: number; isActive: boolean; isArchived: boolean }>;
  const ours = async (query = "") => (await list(query)).filter((c) => Object.values(ids).includes(c.id));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const db = app.get(KYSELY);
    const repo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    await sql`DELETE FROM catalog_layout`.execute(db);
    for (const [name, email, role] of [["أدمن-ترتيب", "admin-catgroups@jest.test", "admin"], ["كاشير-ترتيب", "cashier-catgroups@jest.test", "cashier"]] as const) {
      await repo.save(User.register({ name, email, passwordHash: await hasher.hash("12345678"), role }));
    }
    const login = async (email: string) => (await request(server()).post("/auth/login").send({ email, password: "12345678" })).body.token as string;
    adminToken = await login("admin-catgroups@jest.test");
    cashierToken = await login("cashier-catgroups@jest.test");
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM menu_item_variants WHERE item_id IN (SELECT id FROM menu_items WHERE name = 'صنف-قسم-مؤرشف-جست')`.execute(db);
    await sql`DELETE FROM menu_items WHERE name = 'صنف-قسم-مؤرشف-جست'`.execute(db);
    await sql`DELETE FROM menu_categories WHERE name IN (${sql.join(Object.values(names))})`.execute(db);
    await sql`DELETE FROM catalog_layout`.execute(db);
    await sql`DELETE FROM users WHERE email IN ('admin-catgroups@jest.test', 'cashier-catgroups@jest.test')`.execute(db);
    await app.close();
  });

  test("the offers (combos) tab defaults to the FIRST position when nobody has arranged anything", async () => {
    const res = await request(server()).get("/catalog/layout").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ combosPosition: -1 });
  });

  test("a new category is appended at the END of the order (not shown before everything else)", async () => {
    for (const key of ["a", "b", "c"] as const) {
      const res = await request(server()).post("/catalog/categories").set(auth()).send({ name: names[key] });
      expect(res.status).toBe(201);
      ids[key] = res.body.id;
    }
    const mine = await ours();
    expect(mine.map((c) => c.name)).toEqual([names.a, names.b, names.c]);
    expect(mine[0].displayOrder).toBeLessThan(mine[1].displayOrder);
    expect(mine[1].displayOrder).toBeLessThan(mine[2].displayOrder);
  });

  test("PUT /catalog/categories/order arranges the categories and places the offers tab among them (offers, then فطير, then بيتزا ...)", async () => {
    const res = await request(server()).put("/catalog/categories/order").set(auth()).send({ order: ["combos", ids.a, ids.b, ids.c] });
    expect(res.status).toBe(200);
    expect(res.body.combosPosition).toBe(0);
    const mine = await ours();
    expect(mine.map((c) => c.name)).toEqual([names.a, names.b, names.c]);

    // move the offers between the first and second category, and put the third category first
    const res2 = await request(server()).put("/catalog/categories/order").set(auth()).send({ order: [ids.c, "combos", ids.a, ids.b] });
    expect(res2.status).toBe(200);
    expect((await ours()).map((c) => c.name)).toEqual([names.c, names.a, names.b]);
    const layout = (await request(server()).get("/catalog/layout").set(auth())).body;
    expect(layout.combosPosition).toBe(1);
    const all = await list();
    const orderValues = all.map((c) => c.displayOrder);
    expect(new Set(orderValues).size).toBe(orderValues.length); // every category has its own position
    const firstThree = all.slice(0, 3).map((c) => c.id);
    expect(firstThree[0]).toBe(ids.c);
  });

  test("categories that are not mentioned keep their relative order after the listed ones (a category added meanwhile is not lost)", async () => {
    const res = await request(server()).put("/catalog/categories/order").set(auth()).send({ order: [ids.b] });
    expect(res.status).toBe(200);
    expect((await ours()).map((c) => c.name)).toEqual([names.b, names.c, names.a]);
  });

  test("invalid orders are refused: unknown id, duplicate, not an array", async () => {
    const unknown = await request(server()).put("/catalog/categories/order").set(auth()).send({ order: ["00000000-0000-0000-0000-000000000000"] });
    expect(unknown.status).toBe(400);
    const duplicate = await request(server()).put("/catalog/categories/order").set(auth()).send({ order: [ids.a, ids.a] });
    expect(duplicate.status).toBe(400);
    const notArray = await request(server()).put("/catalog/categories/order").set(auth()).send({ order: "combos" });
    expect(notArray.status).toBe(400);
  });

  test("archiving: the category disappears from the list and the storefront, is paused, and its items are kept", async () => {
    const created = await request(server()).post("/catalog/items").set(auth()).send({ name: "صنف-قسم-مؤرشف-جست", categoryId: ids.b, variants: [{ label: "عادي", price: 50 }] });
    expect(created.status).toBe(201);
    itemId = created.body.id;
    await request(server()).patch(`/catalog/categories/${ids.b}`).set(auth()).send({ isActive: true });

    const before = await request(server()).get("/storefront/menu");
    expect(before.body.categories.map((c: { id: string }) => c.id)).toContain(ids.b);

    const res = await request(server()).post(`/catalog/categories/${ids.b}/archive`).set(auth());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: ids.b, isArchived: true, isActive: false });

    expect((await ours()).map((c) => c.id)).not.toContain(ids.b);
    const archived = await ours("?archived=true");
    expect(archived.map((c) => c.id)).toEqual([ids.b]);
    expect(archived[0].isArchived).toBe(true);

    const after = await request(server()).get("/storefront/menu");
    expect(after.body.categories.map((c: { id: string }) => c.id)).not.toContain(ids.b);

    const items = await request(server()).get("/catalog/items").set(auth());
    const kept = items.body.find((i: { id: string }) => i.id === itemId);
    expect(kept).toMatchObject({ id: itemId, categoryId: ids.b }); // nothing deleted, history stays intact
  });

  test("an archived category cannot be archived again, activated by a PATCH, or included in an order", async () => {
    const again = await request(server()).post(`/catalog/categories/${ids.b}/archive`).set(auth());
    expect(again.status).toBe(409);
    const activate = await request(server()).patch(`/catalog/categories/${ids.b}`).set(auth()).send({ isActive: true });
    expect(activate.status).toBe(409);
    const order = await request(server()).put("/catalog/categories/order").set(auth()).send({ order: [ids.b, ids.a] });
    expect(order.status).toBe(400);
  });

  test("restoring brings the category back PAUSED; activating it afterwards is a separate, explicit step", async () => {
    const res = await request(server()).post(`/catalog/categories/${ids.b}/restore`).set(auth());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isArchived: false, isActive: false });
    expect((await ours()).map((c) => c.id)).toContain(ids.b);
    expect((await ours("?archived=true")).map((c) => c.id)).not.toContain(ids.b);

    const restoreAgain = await request(server()).post(`/catalog/categories/${ids.b}/restore`).set(auth());
    expect(restoreAgain.status).toBe(409);

    const activate = await request(server()).patch(`/catalog/categories/${ids.b}`).set(auth()).send({ isActive: true });
    expect(activate.status).toBe(200);
    expect(activate.body.isActive).toBe(true);
  });

  test("archive / restore / reorder need the catalog.items.manage permission; unknown ids are 404", async () => {
    expect((await request(server()).post(`/catalog/categories/${ids.a}/archive`).set(auth(cashierToken))).status).toBe(403);
    expect((await request(server()).post(`/catalog/categories/${ids.a}/restore`).set(auth(cashierToken))).status).toBe(403);
    expect((await request(server()).put("/catalog/categories/order").set(auth(cashierToken)).send({ order: [ids.a] })).status).toBe(403);
    expect((await request(server()).post("/catalog/categories/00000000-0000-0000-0000-000000000000/archive").set(auth())).status).toBe(404);
    expect((await ours()).map((c) => c.id)).toContain(ids.a); // the refused calls changed nothing
  });
});
