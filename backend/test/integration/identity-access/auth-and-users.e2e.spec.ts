import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import type { Database } from "../../../src/shared/database/database.token";

describe("Identity & Access - /auth و /users (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // مفيش seed script لسه (NEO-5 هيضيفه) - بنعمل أول أدمن مباشرة عن طريق POST /users، وبما إنه مفيش
    // يوزر أصلًا في القاعدة الفاضية دي، الطلب مش محتاج توكن (احتياج تسجيل دخول مسبق هيتضاف لاحقًا لو
    // احتجناه - دلوقتي كل endpoint محتاج توكن إلا / login نفسه، فبنعمل الأدمن الأول مباشرة في القاعدة)
  });

  afterAll(async () => {
    await app.close();
  });

  test("POST /users بدون توكن -> 401", async () => {
    const res = await request(app.getHttpServer()).post("/users").send({
      name: "أدمن", email: "admin@jest.test", password: "12345678", roles: ["admin"],
    });
    expect(res.status).toBe(401);
  });

  // بما إن إنشاء أول أدمن محتاج توكن أصلًا (مفيش استثناء "أول مستخدم"، مطابق تمامًا لسلوك الريبو القديم:
  // POST /api/users محتاج أدمن موجود بالفعل) - النموذج البدائي لأول تشغيلة بيتعمل بالـseed script (NEO-5)
  // أو مباشرة على القاعدة. هنا بنحاكي وجود أدمن بالفعل بإدخاله مباشرة عن طريق الـrepository.
  describe("بعد ما يبقى فيه أدمن في القاعدة", () => {
    let cashierId: string;

    beforeAll(async () => {
      const { UserRepository } = await import(
        "../../../src/contexts/identity-access/infrastructure/persistence/user.repository"
      );
      const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
      const { BcryptPasswordHasher } = await import(
        "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
      );
      const { DATABASE } = await import("../../../src/shared/database/database.module");
      const repo = new UserRepository(app.get<Database>(DATABASE));
      const hasher = new BcryptPasswordHasher();

      const admin = User.register({
        name: "أدمن-جست",
        email: "admin-e2e@jest.test",
        passwordHash: await hasher.hash("12345678"),
        roles: ["admin"],
      });
      await repo.save(admin);

      const loginRes = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "admin-e2e@jest.test", password: "12345678" });
      expect(loginRes.status).toBe(201);
      adminToken = loginRes.body.token;
    });

    test("POST /auth/login ببيانات غلط -> 401", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "admin-e2e@jest.test", password: "wrong-password" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("بيانات الدخول غلط");
    });

    test("GET /auth/me بتوكن صحيح بيرجّع بيانات الأدمن", async () => {
      const res = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe("admin-e2e@jest.test");
      expect(res.body.roles).toEqual(["admin"]);
      expect(res.body.permissions).toContain("identity.roles.manage");
    });

    test("POST /users بتوكن أدمن -> بيعمل كاشير جديد", async () => {
      const res = await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "كاشير-جست", email: "cashier-e2e@jest.test", password: "12345678", roles: ["cashier"] });
      expect(res.status).toBe(201);
      expect(res.body.roles).toEqual(["cashier"]);
      cashierId = res.body.id;
    });

    test("POST /users بإيميل مكرر -> 400", async () => {
      const res = await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "تاني", email: "cashier-e2e@jest.test", password: "12345678", roles: ["cashier"] });
      expect(res.status).toBe(400);
    });

    test("POST /users من غير ولا دور -> 400 (validation)", async () => {
      const res = await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "تاني", email: "no-role@jest.test", password: "12345678", roles: [] });
      expect(res.status).toBe(400);
    });

    test("POST /users بدور غير معروف -> 400 (validation)", async () => {
      const res = await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "تاني", email: "ghost-role@jest.test", password: "12345678", roles: ["ghost"] });
      expect(res.status).toBe(400);
    });

    test("تسجيل دخول بحساب الكاشير الجديد -> بينجح", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "cashier-e2e@jest.test", password: "12345678" });
      expect(res.status).toBe(201);
      expect(res.body.user.roles).toEqual(["cashier"]);
      expect(res.body.user.permissions).toContain("orders.create");
      expect(res.body.user.permissions).not.toContain("identity.users.view");
    });

    test("الكاشير مش يقدر يوصل لـ GET /users (معندوش identity.users.view/manage) -> 403", async () => {
      const loginRes = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "cashier-e2e@jest.test", password: "12345678" });
      const cashierToken = loginRes.body.token;

      const res = await request(app.getHttpServer())
        .get("/users")
        .set("Authorization", `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });

    test("PATCH /users/:id بتوكن أدمن - يديله دور تاني جنب الكاشير (مدير فرع عنده identity.users.view)", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${cashierId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ roles: ["cashier", "branch_manager"] });
      expect(res.status).toBe(200);
      expect(res.body.roles).toEqual(["branch_manager", "cashier"]);
      expect(res.body).not.toHaveProperty("permissionGrants");
    });

    test("بعد ما بقى ليه دور مدير فرع، يقدر يشوف GET /users (صلاحياته = اتحاد صلاحيات أدواره)", async () => {
      const loginRes = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "cashier-e2e@jest.test", password: "12345678" });
      const res = await request(app.getHttpServer())
        .get("/users")
        .set("Authorization", `Bearer ${loginRes.body.token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test("PATCH /users/:id بأدوار فاضية -> 400، وبعدها الأدوار بترجع كاشير بس", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${cashierId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ roles: [] });
      expect(res.status).toBe(400);
      const back = await request(app.getHttpServer())
        .patch(`/users/${cashierId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ roles: ["cashier"] });
      expect(back.body.roles).toEqual(["cashier"]);
    });

    test("GET /users/permissions-catalog بتوكن أدمن بيرجّع الكتالوج ودور الكاشير الافتراضي", async () => {
      const res = await request(app.getHttpServer())
        .get("/users/permissions-catalog")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.catalog.length).toBeGreaterThan(0);
      expect(res.body.rolePermissions.cashier).not.toContain("identity.users.manage");
      expect(res.body.rolePermissions.admin.length).toBeGreaterThan(0);
    });

    describe("PUT /roles/:role/permissions - صلاحيات كل دور محفوظة في القاعدة", () => {
      async function cashierLogin() {
        return request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-e2e@jest.test", password: "12345678" });
      }
      async function catalog() {
        return (await request(app.getHttpServer()).get("/users/permissions-catalog").set("Authorization", `Bearer ${adminToken}`)).body;
      }

      test("إضافة صلاحية لدور الكاشير بتتطبّق على الكاشير من الطلب الجاي، وشيلها بيرجّعها زي ما كانت", async () => {
        const original: string[] = (await catalog()).rolePermissions.cashier;
        const token = (await cashierLogin()).body.token;
        expect((await request(app.getHttpServer()).get("/users").set("Authorization", `Bearer ${token}`)).status).toBe(403);

        const res = await request(app.getHttpServer())
          .put("/roles/cashier/permissions")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ permissions: [...original, "identity.users.view"] });
        expect(res.status).toBe(200);
        expect(res.body.permissions).toContain("identity.users.view");
        expect((await request(app.getHttpServer()).get("/users").set("Authorization", `Bearer ${token}`)).status).toBe(200);
        expect((await request(app.getHttpServer()).get("/auth/me").set("Authorization", `Bearer ${token}`)).body.permissions).toContain("identity.users.view");

        const restore = await request(app.getHttpServer())
          .put("/roles/cashier/permissions")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ permissions: original });
        expect(restore.status).toBe(200);
        expect([...restore.body.permissions].sort()).toEqual([...original].sort());
        expect((await request(app.getHttpServer()).get("/users").set("Authorization", `Bearer ${token}`)).status).toBe(403);
      });

      test("صلاحيات الأدمن مقفولة -> 400", async () => {
        const res = await request(app.getHttpServer())
          .put("/roles/admin/permissions")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ permissions: [] });
        expect(res.status).toBe(400);
        expect((await catalog()).rolePermissions.admin).toContain("identity.roles.manage");
      });

      test("صلاحية مش معروفة أو دور مش معروف -> 400، ومفيش تغيير", async () => {
        const before: string[] = (await catalog()).rolePermissions.cashier;
        const unknownKey = await request(app.getHttpServer())
          .put("/roles/cashier/permissions")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ permissions: ["does.not.exist"] });
        expect(unknownKey.status).toBe(400);
        const unknownRole = await request(app.getHttpServer())
          .put("/roles/ghost/permissions")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ permissions: [] });
        expect(unknownRole.status).toBe(400);
        expect((await catalog()).rolePermissions.cashier).toEqual(before);
      });

      test("الكاشير (من غير identity.roles.manage) مايقدرش يعدّل صلاحيات دور -> 403", async () => {
        const token = (await cashierLogin()).body.token;
        const res = await request(app.getHttpServer())
          .put("/roles/cashier/permissions")
          .set("Authorization", `Bearer ${token}`)
          .send({ permissions: ["identity.users.manage"] });
        expect(res.status).toBe(403);
      });
    });

    test("PATCH /users/:id بباسورد جديد - تسجيل الدخول القديم بيرفض والجديد بينجح", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${cashierId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ password: "newpass123" });
      expect(res.status).toBe(200);

      const oldLogin = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "cashier-e2e@jest.test", password: "12345678" });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "cashier-e2e@jest.test", password: "newpass123" });
      expect(newLogin.status).toBe(201);
    });

    test("PATCH /users/:id بباسورد أقصر من 8 حروف -> 400", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${cashierId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ password: "short" });
      expect(res.status).toBe(400);
    });

    test("PATCH /users/:id يقفل الحساب -> is_active بيبقى false وتسجيل الدخول بعدها يرفض", async () => {
      const patchRes = await request(app.getHttpServer())
        .patch(`/users/${cashierId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.isActive).toBe(false);

      const loginRes = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "cashier-e2e@jest.test", password: "newpass123" }); // الباسورد اتغيّر في اختبار سابق
      expect(loginRes.status).toBe(401);
    });
  });
});
