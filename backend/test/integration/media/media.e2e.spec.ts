import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// صور المنيو والعروض (STORE-2): رفع بصلاحية إدارة المنيو، وخدمة عامة بكاش طويل
describe("Media - صور المنيو (e2e)", () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png-body")]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const db = app.get(KYSELY);
    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const hash = await new BcryptPasswordHasher().hash("12345678");
    const repo = new KyselyUserRepository(db);
    await repo.save(User.register({ name: "أدمن-صور", email: "admin-media@jest.test", passwordHash: hash, role: "admin" }));
    await repo.save(User.register({ name: "كاشير-صور", email: "cashier-media@jest.test", passwordHash: hash, role: "cashier" }));
    adminToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "admin-media@jest.test", password: "12345678" })).body.token;
    cashierToken = (await request(app.getHttpServer()).post("/auth/login").send({ email: "cashier-media@jest.test", password: "12345678" })).body.token;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM media_images WHERE uploaded_by IN (SELECT id FROM users WHERE email LIKE '%-media@jest.test')`.execute(db);
    await sql`DELETE FROM users WHERE email LIKE '%-media@jest.test'`.execute(db);
    await app.close();
  });

  test("رفع صورة وخدمتها للعموم بنفس البايتات ونوعها وكاش سنة، ومسموح تتعرض من دومين تاني", async () => {
    const upload = await request(app.getHttpServer())
      .post("/media/images")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", PNG, { filename: "pizza.jpg", contentType: "image/jpeg" });
    expect(upload.status).toBe(201);
    expect(upload.body.url).toBe(`/media/images/${upload.body.id}`);

    const res = await request(app.getHttpServer()).get(upload.body.url).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    // النوع من محتوى الملف مش من اللي المتصفح قاله
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
  });

  test("ملف مش صورة مرفوض، ومن غير صلاحية إدارة المنيو مرفوض، وصورة مش موجودة 404", async () => {
    const svg = await request(app.getHttpServer())
      .post("/media/images")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from("<svg onload=alert(1)></svg>"), { filename: "x.png", contentType: "image/png" });
    expect(svg.status).toBe(400);
    expect(svg.body.error).toContain("JPG أو PNG أو WebP");

    const cashier = await request(app.getHttpServer())
      .post("/media/images")
      .set("Authorization", `Bearer ${cashierToken}`)
      .attach("file", PNG, "x.png");
    expect(cashier.status).toBe(403);
    expect((await request(app.getHttpServer()).post("/media/images").attach("file", PNG, "x.png")).status).toBe(401);
    expect((await request(app.getHttpServer()).get("/media/images/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});
