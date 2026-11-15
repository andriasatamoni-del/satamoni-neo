import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq, inArray, like } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DATABASE, type Database } from "../../../src/shared/database/database.token";
import { UserRepository } from "../../../src/contexts/identity-access/infrastructure/persistence/user.repository";
import { User } from "../../../src/contexts/identity-access/domain/user.aggregate";
import { BcryptPasswordHasher } from "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher";
import { rolePermissions, roles, users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { BranchRepository } from "../../../src/contexts/branches/infrastructure/persistence/branch.repository";
import { Branch } from "../../../src/contexts/branches/domain/branch.aggregate";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";

describe("dynamic roles - /roles", () => {
  let app: INestApplication;
  let db: Database;
  let adminToken: string;
  let branchA: string;
  let branchB: string;
  const createdRoleKeys: string[] = [];

  const http = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set("Authorization", `Bearer ${adminToken}`);

  async function login(email: string): Promise<string> {
    const res = await http().post("/auth/login").send({ email, password: "12345678" });
    return res.body.token;
  }

  async function createRole(label: string, scope: "branch" | "company", permissions: string[]) {
    const res = await asAdmin(http().post("/roles")).send({ label, scope, permissions });
    if (res.status === 201) createdRoleKeys.push(res.body.key);
    return res;
  }

  async function createUser(email: string, roleKeys: string[], branchId?: string) {
    return asAdmin(http().post("/users")).send({ name: email, email, password: "12345678", roles: roleKeys, branchId });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get<Database>(DATABASE);

    const admin = User.register({
      name: "admin", email: "roles-admin@jest.test", passwordHash: await new BcryptPasswordHasher().hash("12345678"), roles: ["admin"],
    });
    await new UserRepository(db).save(admin);
    adminToken = await login("roles-admin@jest.test");

    const branchRepo = new BranchRepository(db);
    const a = Branch.register({ name: "فرع-أدوار-أ" });
    const b = Branch.register({ name: "فرع-أدوار-ب" });
    await branchRepo.save(a);
    await branchRepo.save(b);
    branchA = a.id;
    branchB = b.id;
  });

  afterAll(async () => {
    await db.delete(users).where(like(users.email, "%roles-%@jest.test"));
    if (createdRoleKeys.length > 0) await db.delete(roles).where(inArray(roles.key, createdRoleKeys));
    await db.delete(branches).where(inArray(branches.id, [branchA, branchB]));
    await app.close();
  });

  test("GET /roles lists the seeded roles from the database; only admin has full access", async () => {
    const res = await asAdmin(http().get("/roles"));
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.body.map((r: { key: string }) => [r.key, r]));
    expect(byKey.admin).toMatchObject({ scope: "company", fullAccess: true });
    expect(byKey.accountant).toMatchObject({ scope: "company", fullAccess: false });
    expect(byKey.callcenter).toMatchObject({ scope: "company", fullAccess: false });
    expect(byKey.cashier).toMatchObject({ scope: "branch", fullAccess: false });
  });

  test("a branch-bound custom role limits its users to the branch on their account", async () => {
    const role = await createRole("مشرف صالة-جست", "branch", ["orders.view"]);
    expect(role.status).toBe(201);
    expect(role.body).toMatchObject({ scope: "branch", fullAccess: false, permissions: ["orders.view"] });

    const user = await createUser("roles-floor@jest.test", [role.body.key], branchA);
    expect(user.status).toBe(201);
    const token = await login("roles-floor@jest.test");

    const me = await http().get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.permissions).toEqual(["orders.view"]);
    expect(me.body.companyWide).toBe(false);
    expect(me.body.roleLabels).toEqual({ [role.body.key]: "مشرف صالة-جست" });

    expect((await http().get(`/orders?branchId=${branchA}`).set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await http().get(`/orders?branchId=${branchB}`).set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect((await http().get("/accounting/accounts").set("Authorization", `Bearer ${token}`)).status).toBe(403);
  });

  test("a generic custom role is company-wide", async () => {
    const role = await createRole("مراقب عام-جست", "company", ["orders.view"]);
    await createUser("roles-auditor@jest.test", [role.body.key]);
    const token = await login("roles-auditor@jest.test");

    const me = await http().get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.companyWide).toBe(true);
    expect((await http().get(`/orders?branchId=${branchB}`).set("Authorization", `Bearer ${token}`)).status).toBe(200);
  });

  test("changing a custom role's scope and permissions applies to its users immediately", async () => {
    const role = await createRole("دور متغيّر-جست", "company", []);
    await createUser("roles-changing@jest.test", [role.body.key], branchA);
    const token = await login("roles-changing@jest.test");

    expect((await asAdmin(http().patch(`/roles/${role.body.key}`)).send({ scope: "branch", label: "دور متغيّر 2-جست" })).status).toBe(200);
    expect((await asAdmin(http().put(`/roles/${role.body.key}/permissions`)).send({ permissions: ["orders.view"] })).status).toBe(200);

    const me = await http().get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.companyWide).toBe(false);
    expect(me.body.permissions).toEqual(["orders.view"]);
    expect(me.body.roleLabels[role.body.key]).toBe("دور متغيّر 2-جست");
  });

  test("rules: duplicate name, roles.manage stays full-access only, the full-access role is locked, unknown role refused", async () => {
    expect((await createRole("مشرف صالة-جست", "branch", [])).status).toBe(409);
    expect((await createRole("مدير أدوار-جست", "company", ["identity.roles.manage"])).status).toBe(400);
    expect((await asAdmin(http().put("/roles/cashier/permissions")).send({ permissions: ["identity.roles.manage"] })).status).toBe(400);
    expect((await asAdmin(http().put("/roles/admin/permissions")).send({ permissions: [] })).status).toBe(400);
    expect((await asAdmin(http().patch("/roles/admin")).send({ scope: "branch" })).status).toBe(400);
    expect((await asAdmin(http().delete("/roles/admin"))).status).toBe(400);
    expect((await asAdmin(http().delete("/roles/role_nothere"))).status).toBe(404);
    expect((await createUser("roles-ghost@jest.test", ["role_nothere"], branchA)).status).toBe(400);
  });

  test("seeded roles are ordinary data: they can be renamed and rescoped like any other role", async () => {
    const renamed = await asAdmin(http().patch("/roles/driver")).send({ label: "طيار-جست", scope: "company" });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ key: "driver", label: "طيار-جست", scope: "company" });
    const restored = await asAdmin(http().patch("/roles/driver")).send({ label: "سائق", scope: "branch" });
    expect(restored.status).toBe(200);
  });

  test("the admin role has every permission in the catalog even without role_permissions rows", async () => {
    const saved = await db.select().from(rolePermissions).where(eq(rolePermissions.role, "admin"));
    await db.delete(rolePermissions).where(eq(rolePermissions.role, "admin"));
    const me = await asAdmin(http().get("/auth/me"));
    const catalog = await asAdmin(http().get("/users/permissions-catalog"));
    await db.insert(rolePermissions).values(saved);
    const allKeys = catalog.body.catalog.flatMap((g: { permissions: { key: string }[] }) => g.permissions.map((p) => p.key)).sort();
    expect(me.body.fullAccess).toBe(true);
    expect(me.body.permissions).toEqual(allKeys);
  });

  test("a role in use can not be deleted; an unused one can", async () => {
    const used = await createRole("دور مستخدم-جست", "branch", []);
    await createUser("roles-used@jest.test", [used.body.key], branchA);
    expect((await asAdmin(http().delete(`/roles/${used.body.key}`))).status).toBe(409);

    const unused = await createRole("دور فاضي-جست", "branch", ["orders.view"]);
    expect((await asAdmin(http().delete(`/roles/${unused.body.key}`))).status).toBe(204);
    const list = await asAdmin(http().get("/roles"));
    expect(list.body.some((r: { key: string }) => r.key === unused.body.key)).toBe(false);
  });

  test("the permissions catalog lists custom roles for the user dialogs", async () => {
    const res = await asAdmin(http().get("/users/permissions-catalog"));
    expect(res.status).toBe(200);
    expect(res.body.roles.some((r: { label: string; scope: string }) => r.label === "مشرف صالة-جست" && r.scope === "branch")).toBe(true);
  });

  test("only admin can manage roles", async () => {
    const res = await createUser("roles-manager@jest.test", ["branch_manager"], branchA);
    expect(res.status).toBe(201);
    const token = await login("roles-manager@jest.test");
    expect((await http().get("/roles").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect((await http().post("/roles").set("Authorization", `Bearer ${token}`).send({ label: "x", scope: "branch", permissions: [] })).status).toBe(403);
  });
});
