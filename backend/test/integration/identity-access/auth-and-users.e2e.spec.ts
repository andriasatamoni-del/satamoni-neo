import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";

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
      name: "أدمن", email: "admin@jest.test", password: "12345678", role: "admin",
    });
    expect(res.status).toBe(401);
  });

  // بما إن إنشاء أول أدمن محتاج توكن أصلًا (مفيش استثناء "أول مستخدم"، مطابق تمامًا لسلوك الريبو القديم:
  // POST /api/users محتاج أدمن موجود بالفعل) - النموذج البدائي لأول تشغيلة بيتعمل بالـseed script (NEO-5)
  // أو مباشرة على القاعدة. هنا بنحاكي وجود أدمن بالفعل بإدخاله مباشرة عن طريق الـrepository.
  describe("بعد ما يبقى فيه أدمن في القاعدة", () => {
    let cashierId: string;

    beforeAll(async () => {
      const { KyselyUserRepository } = await import(
        "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository"
      );
      const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
      const { BcryptPasswordHasher } = await import(
        "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
      );
      const { KYSELY } = await import("../../../src/shared/database/database.module");
      const db = app.get(KYSELY);
      const repo = new KyselyUserRepository(db);
      const hasher = new BcryptPasswordHasher();

      const admin = User.register({
        name: "أدمن-جست",
        email: "admin-e2e@jest.test",
        passwordHash: await hasher.hash("12345678"),
        role: "admin",
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
      expect(res.body.role).toBe("admin");
    });

    test("POST /users بتوكن أدمن -> بيعمل كاشير جديد", async () => {
      const res = await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "كاشير-جست", email: "cashier-e2e@jest.test", password: "12345678", role: "cashier" });
      expect(res.status).toBe(201);
      expect(res.body.role).toBe("cashier");
      cashierId = res.body.id;
    });

    test("POST /users بإيميل مكرر -> 400", async () => {
      const res = await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "تاني", email: "cashier-e2e@jest.test", password: "12345678", role: "cashier" });
      expect(res.status).toBe(400);
    });

    test("POST /users بدور غير معروف -> 400 (validation)", async () => {
      const res = await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "تاني", email: "ghost-role@jest.test", password: "12345678", role: "ghost" });
      expect(res.status).toBe(400);
    });

    test("تسجيل دخول بحساب الكاشير الجديد -> بينجح", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "cashier-e2e@jest.test", password: "12345678" });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe("cashier");
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

    test("PATCH /users/:id بتوكن أدمن - يديله صلاحية إضافية مش من دور الكاشير الأساسي", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${cashierId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ permissions: ["identity.users.view"] });
      expect(res.status).toBe(200);
      expect(res.body.permissionGrants).toContain("identity.users.view");
    });

    test("بعد منحه identity.users.view، الكاشير بقى يقدر يشوف GET /users", async () => {
      const loginRes = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "cashier-e2e@jest.test", password: "12345678" });
      const res = await request(app.getHttpServer())
        .get("/users")
        .set("Authorization", `Bearer ${loginRes.body.token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
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
