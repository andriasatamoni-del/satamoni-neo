import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { asc, eq, inArray, like } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { customerAddresses, customerPhones, customers } from "../../../src/contexts/customers/infrastructure/persistence/customers.tables";

const PHONE_PREFIX = "0109977";
const ADMIN_EMAIL = "admin-customers-tabular@jest.test";
const DRIVER_EMAIL = "driver-customers-tabular@jest.test";
const HEADER = "رقم الموبايل,اسم العميل,رقم تاني,ملاحظات";
const ADDRESS_HEADER = "رقم الموبايل,اسم العميل,المنطقة,اسم الشارع,رقم العمارة,الدور,رقم الشقة,علامة مميزة";
const TEMPLATE_HEADER = "رقم الموبايل,اسم العميل,رقم تاني,المنطقة,اسم الشارع,رقم العمارة,الدور,رقم الشقة,علامة مميزة,العنوان كامل (للعرض فقط),ملاحظات";

function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

describe("Customers import/export - /customers (e2e)", () => {
  let app: INestApplication;
  let db: Database;
  let adminToken: string;
  let driverToken: string;

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
    await repo.save(User.register({ name: "أدمن-عملاء", email: ADMIN_EMAIL, passwordHash, roles: ["admin"] }));
    await repo.save(User.register({ name: "سواق-عملاء", email: DRIVER_EMAIL, passwordHash, roles: ["driver"] }));
    const login = (email: string) => request(app.getHttpServer()).post("/auth/login").send({ email, password: "12345678" });
    adminToken = (await login(ADMIN_EMAIL)).body.token;
    driverToken = (await login(DRIVER_EMAIL)).body.token;
  });

  afterEach(async () => {
    await db.delete(customers).where(like(customers.phone, `${PHONE_PREFIX}%`));
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.email, [ADMIN_EMAIL, DRIVER_EMAIL]));
    await app.close();
  });

  function upload(content: string | Buffer, query = "", token = adminToken) {
    return request(app.getHttpServer())
      .post(`/customers/import${query}`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", typeof content === "string" ? Buffer.from(content, "utf8") : content, "customers.csv");
  }

  function download(path: string, token = adminToken) {
    return request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${token}`).buffer(true).parse(binaryParser);
  }

  async function storedCustomers() {
    const rows = await db
      .select({ id: customers.id, phone: customers.phone, name: customers.name, notes: customers.notes })
      .from(customers)
      .where(like(customers.phone, `${PHONE_PREFIX}%`))
      .orderBy(asc(customers.phone));
    const phones = rows.length
      ? await db
          .select({ customer_id: customerPhones.customer_id, phone: customerPhones.phone })
          .from(customerPhones)
          .where(inArray(customerPhones.customer_id, rows.map((row) => row.id)))
          .orderBy(asc(customerPhones.phone))
      : [];
    return rows.map(({ id, ...row }) => ({ ...row, phones: phones.filter((p) => p.customer_id === id).map((p) => p.phone) }));
  }

  it("creates every row of a valid CSV with its extra phone and notes", async () => {
    const res = await upload(`${HEADER}\n${PHONE_PREFIX}0001,أحمد,${PHONE_PREFIX}1001,عميل دايم\n${PHONE_PREFIX}0002,منى,,\n`);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ dryRun: false, committed: true, totalRows: 2, created: 2, updated: 0, unchanged: 0, issueCount: 0 });
    expect(await storedCustomers()).toEqual([
      { phone: `${PHONE_PREFIX}0001`, name: "أحمد", notes: "عميل دايم", phones: [`${PHONE_PREFIX}0001`, `${PHONE_PREFIX}1001`] },
      { phone: `${PHONE_PREFIX}0002`, name: "منى", notes: null, phones: [`${PHONE_PREFIX}0002`] },
    ]);
  });

  it("updates existing customers by phone and keeps blank cells untouched", async () => {
    await upload(`${HEADER}\n${PHONE_PREFIX}0001,أحمد,,قديم\n${PHONE_PREFIX}0002,منى,,\n`);
    const res = await upload(`${HEADER}\n${PHONE_PREFIX}0001,أحمد علي,${PHONE_PREFIX}1001,\n${PHONE_PREFIX}0002,منى,,\n${PHONE_PREFIX}0003,سارة,,\n`);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 1, updated: 1, unchanged: 1 });
    expect(await storedCustomers()).toEqual([
      { phone: `${PHONE_PREFIX}0001`, name: "أحمد علي", notes: "قديم", phones: [`${PHONE_PREFIX}0001`, `${PHONE_PREFIX}1001`] },
      { phone: `${PHONE_PREFIX}0002`, name: "منى", notes: null, phones: [`${PHONE_PREFIX}0002`] },
      { phone: `${PHONE_PREFIX}0003`, name: "سارة", notes: null, phones: [`${PHONE_PREFIX}0003`] },
    ]);
  });

  it("validates a dry run without writing anything", async () => {
    const res = await upload(`${HEADER}\n${PHONE_PREFIX}0001,أحمد,,\n`, "?dryRun=1");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ dryRun: true, committed: false, created: 1, issueCount: 0 });
    expect(await storedCustomers()).toEqual([]);
  });

  it("rolls back the whole file when a phone is invalid", async () => {
    const res = await upload(`${HEADER}\n${PHONE_PREFIX}0001,أحمد,,\n12ab,منى,,\n`);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ committed: false, totalRows: 2, issueCount: 1 });
    expect(res.body.issues[0]).toMatchObject({ row: 3 });
    expect(await storedCustomers()).toEqual([]);
  });

  it("rejects repeated phones and missing names before running any command", async () => {
    const res = await upload(`${HEADER}\n${PHONE_PREFIX}0001,,,\n${PHONE_PREFIX}0002,منى,,\n${PHONE_PREFIX}0002,منى,,\n`);
    expect(res.status).toBe(422);
    expect(res.body.issues).toEqual([
      { row: 2, column: "اسم العميل", message: "القيمة دي إلزامية" },
      { row: 4, column: "رقم الموبايل", message: "القيمة دي متكررة - موجودة في السطر 3" },
    ]);
    expect(await storedCustomers()).toEqual([]);
  });

  it("refuses users without the customer permissions", async () => {
    const importRes = await upload(`${HEADER}\n${PHONE_PREFIX}0001,أحمد,,\n`, "", driverToken);
    expect(importRes.status).toBe(403);
    const exportRes = await download("/customers/export", driverToken);
    expect(exportRes.status).toBe(403);
    expect(await storedCustomers()).toEqual([]);
  });

  it("exports xlsx that imports back unchanged", async () => {
    await upload(`${HEADER}\n${PHONE_PREFIX}0001,أحمد,${PHONE_PREFIX}1001,عميل دايم\n`);
    const exported = await download(`/customers/export?format=xlsx&q=${PHONE_PREFIX}`);
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toContain("spreadsheetml");
    expect(exported.headers["content-disposition"]).toMatch(/attachment; filename="customers-\d{4}-\d{2}-\d{2}\.xlsx"/);

    const reimport = await upload(exported.body as Buffer);
    expect(reimport.status).toBe(201);
    expect(reimport.body).toMatchObject({ totalRows: 1, unchanged: 1, created: 0, updated: 0 });
  });

  it("rejects an invalid export filter value", async () => {
    const res = await download("/customers/export?blocked=maybe");
    expect(res.status).toBe(400);
  });

  async function storedAddresses(phone: string) {
    return db
      .select({ area: customerAddresses.area, street: customerAddresses.street, distinguishing_mark: customerAddresses.distinguishing_mark, is_default: customerAddresses.is_default })
      .from(customerAddresses)
      .innerJoin(customers, eq(customers.id, customerAddresses.customer_id))
      .where(eq(customers.phone, phone))
      .orderBy(asc(customerAddresses.created_at));
  }

  it("adds the address of a new customer and skips an address it already has", async () => {
    const phone = `${PHONE_PREFIX}0001`;
    const first = await upload(`${ADDRESS_HEADER}
${phone},أحمد,مدينة نصر,عباس العقاد,12,3,7,جنب الصيدلية
`);
    expect(first.body).toMatchObject({ created: 1, issueCount: 0 });
    const again = await upload(`${ADDRESS_HEADER}
${phone},أحمد,مدينة نصر,عباس العقاد,12,3,7,
`);
    expect(again.body).toMatchObject({ unchanged: 1 });
    const second = await upload(`${ADDRESS_HEADER}
${phone},أحمد,المعادي,شارع 9,4,1,2,
`);
    expect(second.body).toMatchObject({ updated: 1 });
    expect(await storedAddresses(phone)).toEqual([
      { area: "مدينة نصر", street: "عباس العقاد", distinguishing_mark: "جنب الصيدلية", is_default: true },
      { area: "المعادي", street: "شارع 9", distinguishing_mark: null, is_default: false },
    ]);
  });

  it("rejects a partly filled address and names the missing field", async () => {
    const res = await upload(`${ADDRESS_HEADER}
${PHONE_PREFIX}0001,أحمد,مدينة نصر,عباس العقاد,,3,7,
`);
    expect(res.status).toBe(422);
    expect(res.body.issues[0]).toMatchObject({ row: 2 });
    expect(res.body.issues[0].message).toContain("رقم العمارة");
    expect(await storedCustomers()).toEqual([]);
  });

  it("exports the default address and imports it back unchanged", async () => {
    const phone = `${PHONE_PREFIX}0001`;
    await upload(`${ADDRESS_HEADER}
${phone},أحمد,مدينة نصر,عباس العقاد,12,3,7,جنب الصيدلية
`);
    const exported = await download(`/customers/export?format=csv&q=${PHONE_PREFIX}`);
    const csv = (exported.body as Buffer).toString("utf8");
    expect(csv).toContain("مدينة نصر,عباس العقاد,12,3,7,جنب الصيدلية");
    expect(csv).toContain("مدينة نصر - عباس العقاد - عمارة 12 - الدور 3 - شقة 7");
    const reimport = await upload(exported.body as Buffer);
    expect(reimport.body).toMatchObject({ totalRows: 1, unchanged: 1 });
    expect(await storedAddresses(phone)).toHaveLength(1);
  });

  it("matches mobiles that lost their leading zero in Excel instead of creating duplicates", async () => {
    await upload(`${HEADER}\n${PHONE_PREFIX}0001,أحمد,${PHONE_PREFIX}1001,\n`);
    const stripped = `${PHONE_PREFIX}0001`.slice(1);
    const res = await upload(`${HEADER}\n${stripped},أحمد,${`${PHONE_PREFIX}1001`.slice(1)},\n`);
    expect(res.body).toMatchObject({ created: 0, unchanged: 1 });
    expect(await storedCustomers()).toHaveLength(1);
  });

  it("serves a header-only CSV template", async () => {
    const res = await download("/customers/import-template?format=csv");
    expect(res.status).toBe(200);
    expect((res.body as Buffer).toString("utf8")).toBe(`﻿${TEMPLATE_HEADER}\r\n`);
  });
});
