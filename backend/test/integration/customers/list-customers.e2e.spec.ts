import "reflect-metadata";
import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { customerAddresses, customers } from "../../../src/contexts/customers/infrastructure/persistence/customers.tables";
import { createSecondUser } from "../helpers/second-user";

describe("Customers - GET /customers (paginated staff list)", () => {
  let app: INestApplication;
  let adminToken: string;
  let accountantToken: string;
  const tag = `lstcust${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    adminToken = (await createSecondUser(app, `admin-${tag}@jest.test`, "admin")).token;
    accountantToken = (await createSecondUser(app, `accountant-${tag}@jest.test`, "accountant")).token;

    const db = app.get<Database>(DATABASE);
    const ids = Array.from({ length: 5 }, () => randomUUID());
    await db.insert(customers).values(
      ids.map((id, i) => ({
        id,
        phone: `0100${Date.now().toString().slice(-6)}${i}`,
        name: `${tag} عميل ${i}`,
        loyalty_points: i * 10,
        is_blocked: i === 4,
        password_hash: "secret-hash",
        created_at: new Date(Date.UTC(2026, 0, 1 + i)),
      }))
    );
    await db.insert(customerAddresses).values([
      { id: randomUUID(), customer_id: ids[3], address_details: "older non-default", created_at: new Date(Date.UTC(2026, 1, 1)) },
      { id: randomUUID(), customer_id: ids[3], address_details: "newer default", is_default: true, created_at: new Date(Date.UTC(2026, 1, 2)) },
      { id: randomUUID(), customer_id: ids[2], address_details: "oldest", created_at: new Date(Date.UTC(2026, 1, 1)) },
      { id: randomUUID(), customer_id: ids[2], address_details: "newest", created_at: new Date(Date.UTC(2026, 1, 3)) },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  const list = (query: Record<string, string | number>, token = adminToken) =>
    request(app.getHttpServer()).get("/customers").query(query).set("Authorization", `Bearer ${token}`);

  it("returns a page with total, newest first by default, without password hashes", async () => {
    const res = await list({ q: tag, limit: 2, offset: 0 }).expect(200);
    expect(res.body).toMatchObject({ total: 5, limit: 2, offset: 0 });
    expect(res.body.items.map((c: { name: string }) => c.name)).toEqual([`${tag} عميل 4`, `${tag} عميل 3`]);
    expect(res.body.items[0]).not.toHaveProperty("password_hash");
  });

  it("pages through the rest of the list", async () => {
    const res = await list({ q: tag, limit: 2, offset: 4 }).expect(200);
    expect(res.body.total).toBe(5);
    expect(res.body.items.map((c: { name: string }) => c.name)).toEqual([`${tag} عميل 0`]);
  });

  it("filters by blocked state and sorts by loyalty points", async () => {
    const blocked = await list({ q: tag, blocked: "true" }).expect(200);
    expect(blocked.body.items.map((c: { name: string }) => c.name)).toEqual([`${tag} عميل 4`]);

    const sorted = await list({ q: tag, blocked: "false", sort: "loyalty_points", order: "desc" }).expect(200);
    expect(sorted.body.total).toBe(4);
    expect(sorted.body.items.map((c: { loyalty_points: number }) => c.loyalty_points)).toEqual([30, 20, 10, 0]);
  });

  it("applies the default page size when no limit is sent", async () => {
    const res = await list({ q: tag }).expect(200);
    expect(res.body.limit).toBe(10);
    expect(res.body.items).toHaveLength(5);
  });

  it("attaches each customer's first address: the default one, else the oldest, else null", async () => {
    const res = await list({ q: tag, sort: "loyalty_points", order: "desc" }).expect(200);
    const firstAddressOf = (name: string) =>
      res.body.items.find((c: { name: string }) => c.name === name).first_address?.address_details ?? null;
    expect(firstAddressOf(`${tag} عميل 3`)).toBe("newer default");
    expect(firstAddressOf(`${tag} عميل 2`)).toBe("oldest");
    expect(firstAddressOf(`${tag} عميل 1`)).toBeNull();
  });

  it("rejects a role without customers.view", async () => {
    await list({ q: tag }, accountantToken).expect(403);
  });
});
