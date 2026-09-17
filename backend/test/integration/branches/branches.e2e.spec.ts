import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Branches - /branches (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { KyselyUserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const db = app.get(KYSELY);
    const repo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-فروع", email: "admin-branches@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await repo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-branches@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    // POST /branches بينشر BranchRegisteredEvent دلوقتي، اللي Treasury context بيسمع له وبينشئ خزينة
    // رئيسية مربوطة بالفرع (treasuries.branch_id FK) - لازم تتشال قبل الفرع نفسه
    await sql`DELETE FROM treasuries`.execute(db);
    await sql`DELETE FROM branches`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-branches@jest.test'`.execute(db);
    await app.close();
  });

  test("POST /branches بتوكن أدمن - بيعمل فرع جديد", async () => {
    const res = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع جست", address: "شارع الاختبار" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("فرع جست");
  });

  test("GET /branches بيرجّع الفروع", async () => {
    const res = await request(app.getHttpServer()).get("/branches").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((b: { name: string }) => b.name === "فرع جست")).toBe(true);
  });
});
