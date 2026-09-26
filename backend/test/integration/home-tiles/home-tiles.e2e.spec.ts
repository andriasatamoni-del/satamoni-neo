import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("HomeTiles - بطاقات الصفحة الرئيسية (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  let seededTileId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();

    const admin = User.register({
      name: "أدمن-بطاقات-جست", email: "admin-home-tiles@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-home-tiles@jest.test", password: "12345678" })).body.token;

    const cashier = User.register({
      name: "كاشير-بطاقات-جست", email: "cashier-home-tiles@jest.test", passwordHash: await hasher.hash("12345678"), role: "cashier",
    });
    await userRepo.save(cashier);
    cashierToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-home-tiles@jest.test", password: "12345678" })).body.token;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM users WHERE email IN ('admin-home-tiles@jest.test', 'cashier-home-tiles@jest.test')`.execute(db);
    await app.close();
  });

  test("GET /home-tiles متاح لأي موظف مسجّل دخول ومرتّب بالـdisplayOrder", async () => {
    const res = await request(app.getHttpServer()).get("/home-tiles").set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const orders = res.body.map((t: { displayOrder: number }) => t.displayOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    seededTileId = res.body[0].id;
  });

  test("GET /home-tiles من غير توكن -> 401", async () => {
    const res = await request(app.getHttpServer()).get("/home-tiles");
    expect(res.status).toBe(401);
  });

  test("PATCH /home-tiles/:id - كاشير مالوش صلاحية home_tiles.manage -> 403", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/home-tiles/${seededTileId}`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ title: "عنوان جديد" });
    expect(res.status).toBe(403);
  });

  test("PATCH /home-tiles/:id - أدمن بيقدر يعدّل العنوان/الوصف/الترتيب، وtileKey/href/icon يفضلوا ثابتين", async () => {
    const before = (await request(app.getHttpServer()).get("/home-tiles").set("Authorization", `Bearer ${adminToken}`)).body.find(
      (t: { id: string }) => t.id === seededTileId
    );

    const res = await request(app.getHttpServer())
      .patch(`/home-tiles/${seededTileId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "عنوان معدّل-جست", description: "وصف معدّل-جست", displayOrder: 999 });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("عنوان معدّل-جست");
    expect(res.body.description).toBe("وصف معدّل-جست");
    expect(res.body.displayOrder).toBe(999);
    expect(res.body.tileKey).toBe(before.tileKey);
    expect(res.body.href).toBe(before.href);
    expect(res.body.icon).toBe(before.icon);

    // نرجّع الترتيب الأصلي عشان ما نبوظش ترتيب باقي الاختبارات اللي بتعتمد على البطاقات دي
    await request(app.getHttpServer())
      .patch(`/home-tiles/${seededTileId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: before.title, description: before.description, displayOrder: before.displayOrder });
  });

  test("PATCH /home-tiles/:id بمعرّف مش موجود -> 404", async () => {
    const res = await request(app.getHttpServer())
      .patch("/home-tiles/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "x" });
    expect(res.status).toBe(404);
  });
});
