import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { menuItemVariants, menuItems } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";
import { createSecondUser } from "../helpers/second-user";
import { markReadyForSale } from "../helpers/menu";

interface LiveStream {
  events: { type: string; data: string }[];
  waitFor(predicate: (e: { type: string; data: string }) => boolean, timeoutMs?: number): Promise<{ type: string; data: string }>;
  close(): void;
}

describe("Orders live stream: call-center orders reach the branch screen instantly", () => {
  let app: INestApplication;
  let db: Database;
  let baseUrl: string;
  let callCenterToken: string;
  let cashierToken: string;
  let branchAId: string;
  let branchBId: string;
  let variantId: string;
  let menuItemId: string;
  const streams: LiveStream[] = [];
  const emails = ["live-callcenter@jest.test", "live-manager@jest.test"];

  async function openStream(token: string | null, query = ""): Promise<LiveStream | Response> {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/orders/live${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return res;
    const events: { type: string; data: string }[] = [];
    const waiters: (() => void)[] = [];
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const type = block.match(/^event: ?(.*)$/m)?.[1] ?? "message";
            const data = block.match(/^data: ?(.*)$/m)?.[1] ?? "";
            events.push({ type, data });
          }
          waiters.splice(0).forEach((w) => w());
        }
      } catch {
        return;
      }
    })();
    const stream: LiveStream = {
      events,
      async waitFor(predicate, timeoutMs = 5000) {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          const found = events.find(predicate);
          if (found) return found;
          if (Date.now() > deadline) throw new Error(`no matching live event; got ${JSON.stringify(events)}`);
          await new Promise<void>((resolve) => {
            waiters.push(resolve);
            setTimeout(resolve, 100);
          });
        }
      },
      close: () => controller.abort(),
    };
    streams.push(stream);
    await stream.waitFor((e) => e.type === "ready");
    return stream;
  }

  async function placeOrder(token: string, branchId: string): Promise<string> {
    const res = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, orderType: "takeaway", items: [{ variantId, quantity: 1 }] }),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    return body.id as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    db = app.get<Database>(DATABASE);

    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const branchRepo = new BranchRepository(db);
    const branchA = Branch.register({ name: "فرع-أ-مباشر-جست" });
    const branchB = Branch.register({ name: "فرع-ب-مباشر-جست" });
    await branchRepo.save(branchA);
    await branchRepo.save(branchB);
    branchAId = branchA.id;
    branchBId = branchB.id;

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const callCenter = User.register({
      name: "كول-سنتر-مباشر", email: emails[0], passwordHash: await new BcryptPasswordHasher().hash("12345678"), roles: ["callcenter"],
    });
    await new UserRepository(db).save(callCenter);
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emails[0], password: "12345678" }),
    });
    callCenterToken = (await login.json()).token;
    cashierToken = (await createSecondUser(app, emails[1], "branch_manager", branchAId)).token;

    const { MenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
    const item = MenuItem.register({ name: "صنف-مباشر-جست" });
    const variant = item.addVariant({ label: "عادي", price: 50, talabatPrice: 50 });
    await new MenuItemRepository(db).save(item);
    await markReadyForSale(db, [item.id]);
    menuItemId = item.id;
    variantId = variant.id;
  });

  afterEach(() => {
    streams.splice(0).forEach((s) => s.close());
  });

  afterAll(async () => {
    const orderIds = db.select({ id: orders.id }).from(orders).where(inArray(orders.branch_id, [branchAId, branchBId]));
    await db.delete(printJobs).where(inArray(printJobs.branch_id, [branchAId, branchBId]));
    await db.delete(orderItems).where(inArray(orderItems.order_id, orderIds));
    await db.delete(orders).where(inArray(orders.branch_id, [branchAId, branchBId]));
    await db.delete(menuItemVariants).where(eq(menuItemVariants.item_id, menuItemId));
    await db.delete(menuItems).where(eq(menuItems.id, menuItemId));
    await db.delete(users).where(inArray(users.email, emails));
    await db.delete(branches).where(inArray(branches.id, [branchAId, branchBId]));
    await app.close();
  });

  it("pushes a call-center order to the branch's open screen as soon as it is saved", async () => {
    const branchScreen = (await openStream(cashierToken)) as LiveStream;
    const orderId = await placeOrder(callCenterToken, branchAId);
    const event = await branchScreen.waitFor((e) => e.type === "order" && e.data.includes(orderId), 2000);
    expect(JSON.parse(event.data)).toEqual({ change: "registered", orderId, branchId: branchAId });
  });

  it("does not push another branch's orders to a branch screen", async () => {
    const branchScreen = (await openStream(cashierToken)) as LiveStream;
    const otherOrderId = await placeOrder(callCenterToken, branchBId);
    const ownOrderId = await placeOrder(callCenterToken, branchAId);
    await branchScreen.waitFor((e) => e.data.includes(ownOrderId), 2000);
    expect(branchScreen.events.some((e) => e.data.includes(otherOrderId))).toBe(false);
  });

  it("pushes kitchen progress on the branch's orders", async () => {
    const branchScreen = (await openStream(cashierToken)) as LiveStream;
    const orderId = await placeOrder(callCenterToken, branchAId);
    const res = await fetch(`${baseUrl}/orders/${orderId}/kitchen-status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${cashierToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ kitchenStatus: "ACCEPTED" }),
    });
    expect(res.status).toBe(200);
    const event = await branchScreen.waitFor((e) => e.data.includes(`"change":"kitchen"`) && e.data.includes(orderId), 2000);
    expect(JSON.parse(event.data).branchId).toBe(branchAId);
  });

  it("refuses a branch user who asks for another branch's stream", async () => {
    const res = (await openStream(cashierToken, `?branchId=${branchBId}`)) as Response;
    expect(res.status).toBe(403);
  });

  it("refuses an unauthenticated stream", async () => {
    const res = (await openStream(null)) as Response;
    expect(res.status).toBe(401);
  });
});
