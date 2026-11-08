import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { inArray, like } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { inventoryItems } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";

const SUFFIX = "-tabular-جست";
const ADMIN_EMAIL = "admin-inventory-tabular@jest.test";
const CASHIER_EMAIL = "cashier-inventory-tabular@jest.test";

function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

describe("Inventory items import/export - /inventory/items (e2e)", () => {
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
    await repo.save(User.register({ name: "أدمن-استيراد", email: ADMIN_EMAIL, passwordHash, roles: ["admin"] }));
    await repo.save(User.register({ name: "كاشير-استيراد", email: CASHIER_EMAIL, passwordHash, roles: ["cashier"] }));
    const login = (email: string) => request(app.getHttpServer()).post("/auth/login").send({ email, password: "12345678" });
    adminToken = (await login(ADMIN_EMAIL)).body.token;
    cashierToken = (await login(CASHIER_EMAIL)).body.token;
  });

  afterEach(async () => {
    await db.delete(inventoryItems).where(like(inventoryItems.name, `%${SUFFIX}`));
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.email, [ADMIN_EMAIL, CASHIER_EMAIL]));
    await app.close();
  });

  function upload(content: string | Buffer, query = "", token = adminToken) {
    return request(app.getHttpServer())
      .post(`/inventory/items/import${query}`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", typeof content === "string" ? Buffer.from(content, "utf8") : content, "items.csv");
  }

  function download(path: string) {
    return request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${adminToken}`).buffer(true).parse(binaryParser);
  }

  async function storedItems(): Promise<Array<{ name: string; unit_cost: number | null }>> {
    const rows = await db
      .select({ name: inventoryItems.name, unit_cost: inventoryItems.unit_cost })
      .from(inventoryItems)
      .where(like(inventoryItems.name, `%${SUFFIX}`));
    return rows.map((row) => ({ name: row.name, unit_cost: row.unit_cost === null ? null : Number(row.unit_cost) })).sort((a, b) => a.name.localeCompare(b.name));
  }

  it("creates every row of a valid CSV in one go", async () => {
    const res = await upload(`اسم الصنف,الوحدة,تكلفة الوحدة,النوع\nسكر${SUFFIX},كيلو,25,خام\nصلصة${SUFFIX},لتر,,مصنع\n`);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ dryRun: false, committed: true, totalRows: 2, checkedRows: 2, created: 2, updated: 0, unchanged: 0, issueCount: 0 });
    expect(await storedItems()).toEqual([
      { name: `سكر${SUFFIX}`, unit_cost: 25 },
      { name: `صلصة${SUFFIX}`, unit_cost: null },
    ]);
  });

  it("updates existing items by name and leaves missing columns untouched", async () => {
    await upload(`اسم الصنف,الوحدة,تكلفة الوحدة\nسكر${SUFFIX},كيلو,25\nملح${SUFFIX},كيلو,5\n`);
    const res = await upload(`اسم الصنف,الوحدة,تكلفة الوحدة\nسكر${SUFFIX},كيلو,30\nملح${SUFFIX},كيلو,5\nخل${SUFFIX},لتر,12\n`);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 1, updated: 1, unchanged: 1 });

    const withoutCost = await upload(`اسم الصنف,الوحدة\nسكر${SUFFIX},كيلو\n`);
    expect(withoutCost.body).toMatchObject({ unchanged: 1 });
    expect(await storedItems()).toEqual([
      { name: `خل${SUFFIX}`, unit_cost: 12 },
      { name: `سكر${SUFFIX}`, unit_cost: 30 },
      { name: `ملح${SUFFIX}`, unit_cost: 5 },
    ]);
  });

  it("validates a dry run without writing anything", async () => {
    const res = await upload(`اسم الصنف,الوحدة\nملح${SUFFIX},كيلو\n`, "?dryRun=1");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ dryRun: true, committed: false, created: 1, issueCount: 0 });
    expect(await storedItems()).toEqual([]);
  });

  it("rolls back the whole file when a row breaks a business rule", async () => {
    await upload(`اسم الصنف,الوحدة\nأرز${SUFFIX},كيلو\n`);
    const res = await upload(`اسم الصنف,الوحدة,تكلفة الوحدة\nزيت${SUFFIX},لتر,40\nأرز${SUFFIX},لتر,10\nبن${SUFFIX},كيلو,300\n`);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ committed: false, totalRows: 3, checkedRows: 2, issueCount: 1 });
    expect(res.body.issues[0]).toMatchObject({ row: 3 });
    expect(res.body.issues[0].message).toContain("وحدة القياس");
    expect(await storedItems()).toEqual([{ name: `أرز${SUFFIX}`, unit_cost: null }]);
  });

  it("rejects cell errors and repeated names before running any command", async () => {
    const res = await upload(`اسم الصنف,الوحدة,تكلفة الوحدة\nخل${SUFFIX},,abc\nعسل${SUFFIX},كيلو,1\nعسل${SUFFIX},كيلو,2\n`);
    expect(res.status).toBe(422);
    expect(res.body.issues).toEqual([
      { row: 2, column: "الوحدة", message: "القيمة دي إلزامية" },
      { row: 2, column: "تكلفة الوحدة", message: '"abc" مش رقم (الكسور بتتكتب بنقطة: 1.5)' },
      { row: 4, column: "اسم الصنف", message: "القيمة دي متكررة - موجودة في السطر 3" },
    ]);
    expect(await storedItems()).toEqual([]);
  });

  it("answers 400 for a file that is not a spreadsheet", async () => {
    const res = await upload(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("xls");
  });

  it("refuses users without the manage permission", async () => {
    const res = await upload(`اسم الصنف,الوحدة\nممنوع${SUFFIX},كيلو\n`, "", cashierToken);
    expect(res.status).toBe(403);
    expect(await storedItems()).toEqual([]);
  });

  it("exports xlsx that imports back unchanged", async () => {
    await upload(`اسم الصنف,الوحدة,تكلفة الوحدة\nبن${SUFFIX},كيلو,300\n`);
    const exported = await download(`/inventory/items/export?format=xlsx&q=${encodeURIComponent(SUFFIX)}`);
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toContain("spreadsheetml");
    expect(exported.headers["content-disposition"]).toMatch(/attachment; filename="inventory-items-\d{4}-\d{2}-\d{2}\.xlsx"/);

    const reimport = await upload(exported.body as Buffer);
    expect(reimport.status).toBe(201);
    expect(reimport.body).toMatchObject({ totalRows: 1, unchanged: 1, created: 0, updated: 0 });
  });

  it("rejects an unknown export filter value", async () => {
    const res = await download("/inventory/items/export?itemType=wood");
    expect(res.status).toBe(400);
  });

  it("serves a header-only CSV template", async () => {
    const res = await download("/inventory/items/import-template?format=csv");
    expect(res.status).toBe(200);
    expect((res.body as Buffer).toString("utf8")).toBe("﻿اسم الصنف,الوحدة,تكلفة الوحدة,النوع,سياسة الرصيد السالب\r\n");
  });
});
