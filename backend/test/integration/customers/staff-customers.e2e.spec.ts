import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { customerPhones, customers } from "../../../src/contexts/customers/infrastructure/persistence/customers.tables";
import { createSecondUser } from "../helpers/second-user";

const ADDRESS = { area: "المعادي", street: "شارع 9", building: "12", floor: "3", apartment: "5", distinguishingMark: "جنب الصيدلية" };

describe("Customers - staff lookup / register / phones / addresses, and POS orders linked to a customer", () => {
  let app: INestApplication;
  let db: Database;
  let cashierToken: string;
  let accountantToken: string;
  let branchId: string;
  let variantId: string;
  const tag = `stfcust${Date.now()}`;
  const suffix = Date.now().toString().slice(-6);
  const primaryPhone = `0101${suffix}0`;
  const homePhone = `0122${suffix}1`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get<Database>(DATABASE);

    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { MenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");

    const branch = Branch.register({ name: `فرع ${tag}` });
    await new BranchRepository(db).save(branch);
    branchId = branch.id;

    const item = MenuItem.register({ name: `صنف ${tag}` });
    variantId = item.addVariant({ label: "عادي", price: 50 }).id;
    await new MenuItemRepository(db).save(item);

    cashierToken = (await createSecondUser(app, `manager-${tag}@jest.test`, "branch_manager", branchId)).token;
    accountantToken = (await createSecondUser(app, `accountant-${tag}@jest.test`, "accountant")).token;
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) => request(app.getHttpServer()).post(url).set("Authorization", `Bearer ${token}`),
  });

  let customerId: string;

  it("registers a customer with several phones and addresses", async () => {
    const res = await as(cashierToken)
      .post("/customers")
      .send({ name: `${tag} سامي`, phone: primaryPhone, extraPhones: [{ phone: homePhone, label: "البيت" }], addresses: [ADDRESS] })
      .expect(201);
    customerId = res.body.id;
    expect(res.body.phones).toEqual([
      expect.objectContaining({ phone: primaryPhone, isPrimary: true }),
      expect.objectContaining({ phone: homePhone, isPrimary: false, label: "البيت" }),
    ]);
    expect(res.body.addresses).toHaveLength(1);

    const [row] = await db.select().from(customers).where(eq(customers.id, customerId));
    expect(row).toMatchObject({ phone: primaryPhone, phone2: homePhone, password_hash: null });
  });

  it("refuses a second customer with the same primary phone", async () => {
    await as(cashierToken).post("/customers").send({ name: "تاني", phone: primaryPhone }).expect(409);
  });

  it("finds the customer by any phone or by name", async () => {
    for (const q of [homePhone.slice(0, 8), `${tag} سا`]) {
      const res = await as(cashierToken).get("/customers/lookup").query({ q }).expect(200);
      expect(res.body.map((c: { id: string }) => c.id)).toContain(customerId);
    }
  });

  it("adds a phone and an address to an existing customer", async () => {
    const workPhone = `0155${suffix}2`;
    const phoneRes = await as(cashierToken).post(`/customers/${customerId}/phones`).send({ phone: workPhone }).expect(201);
    expect(phoneRes.body.phones.map((p: { phone: string }) => p.phone)).toEqual([primaryPhone, homePhone, workPhone]);
    await as(cashierToken).post(`/customers/${customerId}/phones`).send({ phone: workPhone }).expect(409);

    const addressRes = await as(cashierToken).post(`/customers/${customerId}/addresses`).send({ ...ADDRESS, area: "مدينة نصر" }).expect(201);
    expect(addressRes.body.customer.addresses).toHaveLength(2);
    expect(await db.select().from(customerPhones).where(eq(customerPhones.customer_id, customerId))).toHaveLength(3);
  });

  it("does not let a role without customers.manage / orders.create register customers", async () => {
    await as(accountantToken).post("/customers").send({ name: "x", phone: `0109${suffix}9` }).expect(403);
    await as(accountantToken).get("/customers/lookup").query({ q: primaryPhone }).expect(403);
  });

  it("links a takeaway order to the customer with the chosen phone", async () => {
    const res = await as(cashierToken)
      .post("/orders")
      .send({ branchId, orderType: "takeaway", customerId, customerPhone: homePhone, items: [{ variantId, quantity: 1 }] })
      .expect(201);
    expect(res.body).toMatchObject({ customerId, customerName: `${tag} سامي`, customerPhone: homePhone, addressDetails: null });
  });

  it("snapshots the chosen address on a delivery order and requires one", async () => {
    const lookup = await as(cashierToken).get("/customers/lookup").query({ q: primaryPhone }).expect(200);
    const address = lookup.body.find((c: { id: string }) => c.id === customerId).addresses[0];

    const res = await as(cashierToken)
      .post("/orders")
      .send({ branchId, orderType: "delivery", customerId, customerAddressId: address.id, items: [{ variantId, quantity: 1 }] })
      .expect(201);
    expect(res.body.customerPhone).toBe(primaryPhone);
    expect(res.body.addressDetails).toBe(`${address.addressDetails} - علامة مميزة: جنب الصيدلية`);
    const [row] = await db.select().from(orders).where(eq(orders.id, res.body.id));
    expect(row.customer_id).toBe(customerId);

    await as(cashierToken)
      .post("/orders")
      .send({ branchId, orderType: "delivery", customerId, items: [{ variantId, quantity: 1 }] })
      .expect(400);
  });

  it("rejects a phone that is not the customer's", async () => {
    await as(cashierToken)
      .post("/orders")
      .send({ branchId, orderType: "takeaway", customerId, customerPhone: "01099999999", items: [{ variantId, quantity: 1 }] })
      .expect(400);
  });
});
