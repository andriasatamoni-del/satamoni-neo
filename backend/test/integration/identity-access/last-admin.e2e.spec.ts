import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { and, eq, inArray, ne } from "drizzle-orm";
import { AppModule } from "../../../src/app.module";
import { DATABASE, type Database } from "../../../src/shared/database/database.token";
import { UserRepository } from "../../../src/contexts/identity-access/infrastructure/persistence/user.repository";
import { User } from "../../../src/contexts/identity-access/domain/user.aggregate";
import { BcryptPasswordHasher } from "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher";
import { userRoles, users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";

describe("at least one active admin always remains", () => {
  let app: INestApplication;
  let db: Database;
  let repo: UserRepository;
  let lastAdmin: User;
  let lastAdminToken: string;
  let otherAdminIds: string[] = [];

  async function createUser(email: string, roles: string[]): Promise<User> {
    const user = User.register({ name: email, email, passwordHash: await new BcryptPasswordHasher().hash("12345678"), roles });
    await repo.save(user);
    return user;
  }

  function patchUser(id: string, body: object) {
    return request(app.getHttpServer()).patch(`/users/${id}`).set("Authorization", `Bearer ${lastAdminToken}`).send(body);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get<Database>(DATABASE);
    repo = new UserRepository(db);

    lastAdmin = await createUser("last-admin@jest.test", ["admin"]);
    const adminIds = db.select({ id: userRoles.user_id }).from(userRoles).where(eq(userRoles.role, "admin"));
    const deactivated = await db
      .update(users)
      .set({ is_active: false })
      .where(and(inArray(users.id, adminIds), ne(users.id, lastAdmin.id), eq(users.is_active, true)))
      .returning({ id: users.id });
    otherAdminIds = deactivated.map((r) => r.id);

    const login = await request(app.getHttpServer()).post("/auth/login").send({ email: "last-admin@jest.test", password: "12345678" });
    lastAdminToken = login.body.token;
  });

  afterAll(async () => {
    if (otherAdminIds.length > 0) await db.update(users).set({ is_active: true }).where(inArray(users.id, otherAdminIds));
    await app.close();
  });

  test("removing the admin role from the last active admin -> 409", async () => {
    const res = await patchUser(lastAdmin.id, { roles: ["cashier"] });
    expect(res.status).toBe(409);
    expect((await repo.findById(lastAdmin.id))?.roles).toEqual(["admin"]);
  });

  test("deactivating the last active admin -> 409", async () => {
    const res = await patchUser(lastAdmin.id, { isActive: false });
    expect(res.status).toBe(409);
    expect((await repo.findById(lastAdmin.id))?.isActive).toBe(true);
  });

  test("an admin can be demoted while another active admin remains", async () => {
    const second = await createUser("second-admin@jest.test", ["admin"]);
    const res = await patchUser(second.id, { roles: ["cashier"] });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(["cashier"]);
  });

  test("the last admin can still change their branch or password", async () => {
    const res = await patchUser(lastAdmin.id, { password: "new-password-1" });
    expect(res.status).toBe(200);
  });
});
