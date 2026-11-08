import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { INestApplication, Injectable, Module, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { IdentityAccessModule } from "../../../src/contexts/identity-access/identity-access.module";
import { PERMISSION } from "../../../src/contexts/identity-access/domain/permission";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { column } from "../../../src/shared/tabular/sheet/sheet-column";
import { defineSheet, type SheetRow } from "../../../src/shared/tabular/sheet/sheet-definition";
import { rowCreated, type TabularAdapter, type TabularContext, type TabularImportContext } from "../../../src/shared/tabular/tabular-adapter";
import { TabularController } from "../../../src/shared/tabular/tabular.controller";

const PROBE_SHEET = defineSheet({ name: "probe", sheetName: "probe", columns: [column.text("name", "الاسم").required()] });

@Injectable()
class ProbeTabular implements TabularAdapter<typeof PROBE_SHEET> {
  readonly sheet = PROBE_SHEET;
  readonly importedFor: Array<string | undefined> = [];

  async exportRows(_filter: object, context: TabularContext): Promise<SheetRow<typeof PROBE_SHEET>[]> {
    return [{ name: context.branchId ?? "all" }];
  }

  async importRow(_row: SheetRow<typeof PROBE_SHEET>, context: TabularImportContext<undefined>) {
    this.importedFor.push(context.branchId);
    return rowCreated();
  }
}

@Module({
  imports: [IdentityAccessModule],
  controllers: [
    TabularController({
      path: "tabular-probe",
      adapter: ProbeTabular,
      branchScoped: true,
      permissions: { export: [PERMISSION.CATALOG_ITEMS_VIEW], import: [PERMISSION.CATALOG_ITEMS_VIEW] },
    }),
  ],
  providers: [ProbeTabular],
})
class ProbeModule {}

const ADMIN_EMAIL = "admin-tabular-probe@jest.test";
const CASHIER_EMAIL = "cashier-tabular-probe@jest.test";

function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

describe("TabularController - branch-scoped routes (e2e)", () => {
  let app: INestApplication;
  let db: Database;
  let probe: ProbeTabular;
  let branchId: string;
  let adminToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get<Database>(DATABASE);
    probe = app.get(ProbeTabular);

    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const branch = Branch.register({ name: "فرع-جدولي-جست" });
    await new BranchRepository(db).save(branch);
    branchId = branch.id;

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const passwordHash = await new BcryptPasswordHasher().hash("12345678");
    const repo = new UserRepository(db);
    await repo.save(User.register({ name: "أدمن-جدولي", email: ADMIN_EMAIL, passwordHash, roles: ["admin"] }));
    await repo.save(User.register({ name: "كاشير-جدولي", email: CASHIER_EMAIL, passwordHash, roles: ["cashier"], branchId }));
    const login = (email: string) => request(app.getHttpServer()).post("/auth/login").send({ email, password: "12345678" });
    adminToken = (await login(ADMIN_EMAIL)).body.token;
    cashierToken = (await login(CASHIER_EMAIL)).body.token;
  });

  beforeEach(() => {
    probe.importedFor.length = 0;
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.email, [ADMIN_EMAIL, CASHIER_EMAIL]));
    await db.delete(branches).where(eq(branches.id, branchId));
    await app.close();
  });

  function exportAs(token: string, query = "") {
    return request(app.getHttpServer()).get(`/tabular-probe/export?format=csv${query}`).set("Authorization", `Bearer ${token}`).buffer(true).parse(binaryParser);
  }

  function importAs(token: string, query = "") {
    return request(app.getHttpServer())
      .post(`/tabular-probe/import${query}`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("الاسم\nس\n", "utf8"), "probe.csv");
  }

  it("pins a branch-bound user's export and import to their own branch", async () => {
    const exported = await exportAs(cashierToken);
    expect(exported.status).toBe(200);
    expect((exported.body as Buffer).toString("utf8")).toContain(branchId);

    const imported = await importAs(cashierToken);
    expect(imported.status).toBe(201);
    expect(probe.importedFor).toEqual([branchId]);
  });

  it("refuses a branch-bound user who names another branch", async () => {
    const other = randomUUID();
    expect((await exportAs(cashierToken, `&branchId=${other}`)).status).toBe(403);
    expect((await importAs(cashierToken, `?branchId=${other}`)).status).toBe(403);
    expect(probe.importedFor).toEqual([]);
  });

  it("lets a company-wide user export every branch but requires a branch to import", async () => {
    expect((await exportAs(adminToken)).body.toString("utf8")).toContain("all");

    const withoutBranch = await importAs(adminToken);
    expect(withoutBranch.status).toBe(400);
    expect(withoutBranch.body.error).toContain("branchId");

    const withBranch = await importAs(adminToken, `?branchId=${branchId}`);
    expect(withBranch.status).toBe(201);
    expect(probe.importedFor).toEqual([branchId]);
  });
});
