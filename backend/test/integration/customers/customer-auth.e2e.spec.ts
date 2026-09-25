import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// e2e لبوابة الدخول الذاتي للعملاء (customer-auth) - راجع تعليق customer.aggregate.ts للفلسفة (نفس
// مفهوم المرحلة 8.38 بالريبو القديم بالحرف: رقم تليفون + كلمة سر، منفصل تمامًا عن دخول الموظفين)
describe("CustomerAuth - بوابة الدخول الذاتي للعملاء (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  const phone = "01099998888";
  const guestPhone = "01099997777";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM customer_addresses WHERE customer_id IN (SELECT id FROM customers WHERE phone IN (${phone}, ${guestPhone}))`.execute(db);
    await sql`DELETE FROM customers WHERE phone IN (${phone}, ${guestPhone})`.execute(db);
    await app.close();
  });

  let token: string;

  test("POST /customer-auth/register بيسجّل حساب جديد وبيرجّع توكن", async () => {
    const res = await request(app.getHttpServer())
      .post("/customer-auth/register")
      .send({ phone, name: "عميل-جست", password: "123456" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.customer.phone).toBe(phone);
    expect(res.body.customer.name).toBe("عميل-جست");
    token = res.body.token;
  });

  test("POST /customer-auth/register بنفس الرقم تاني -> 409", async () => {
    const res = await request(app.getHttpServer())
      .post("/customer-auth/register")
      .send({ phone, name: "عميل تاني", password: "123456" });
    expect(res.status).toBe(409);
  });

  test("POST /customer-auth/register بكلمة سر قصيرة -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/customer-auth/register")
      .send({ phone: "01011112222", name: "عميل", password: "123" });
    expect(res.status).toBe(400);
  });

  test("POST /customer-auth/login ببيانات صحيحة بيرجّع توكن", async () => {
    const res = await request(app.getHttpServer()).post("/customer-auth/login").send({ phone, password: "123456" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
  });

  test("POST /customer-auth/login بكلمة سر غلط -> 401", async () => {
    const res = await request(app.getHttpServer()).post("/customer-auth/login").send({ phone, password: "wrongpass" });
    expect(res.status).toBe(401);
  });

  test("POST /customer-auth/login برقم مش موجود -> 401 (نفس رسالة كلمة السر الغلط، موحّدة)", async () => {
    const res = await request(app.getHttpServer()).post("/customer-auth/login").send({ phone: "01000000000", password: "123456" });
    expect(res.status).toBe(401);
  });

  test("GET /customer-auth/me من غير توكن -> 401", async () => {
    const res = await request(app.getHttpServer()).get("/customer-auth/me");
    expect(res.status).toBe(401);
  });

  test("GET /customer-auth/me بتوكن صحيح بيرجّع بيانات الحساب", async () => {
    const res = await request(app.getHttpServer()).get("/customer-auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe(phone);
    expect(res.body.name).toBe("عميل-جست");
  });

  test("GET /customer-auth/me بتوكن موظف عادي (سر مختلف) -> 401", async () => {
    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const staff = User.register({
      name: "موظف-كروس-توكن-جست", email: "staff-cross-token@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(staff);
    const staffToken = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: "staff-cross-token@jest.test", password: "12345678" })
    ).body.token;

    const res = await request(app.getHttpServer()).get("/customer-auth/me").set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(401);

    await sql`DELETE FROM users WHERE email = 'staff-cross-token@jest.test'`.execute(db);
  });

  test("عميل ضيف (سجّل قبل كده من غير حساب) - register بيتحول لحساب حقيقي وبيحافظ على نقاط الولاء", async () => {
    const db = app.get(KYSELY);
    // عميل ضيف حقيقي بيتسجّل من غير باسورد خالص (password_hash=NULL) - نفس فلسفة الريبو القديم بالحرف
    await sql`
      INSERT INTO customers (id, phone, name, loyalty_points, password_hash)
      VALUES (gen_random_uuid(), ${guestPhone}, 'ضيف-جست', 30, NULL)
    `.execute(db);

    const res = await request(app.getHttpServer())
      .post("/customer-auth/register")
      .send({ phone: guestPhone, name: "عميل حقيقي دلوقتي", password: "123456" });
    expect(res.status).toBe(201);
    expect(res.body.customer.loyaltyPoints).toBe(30);
    expect(res.body.customer.name).toBe("عميل حقيقي دلوقتي");
  });

  test("POST /customer-auth/me/addresses و GET بيسجّلوا ويرجّعوا دفتر العناوين", async () => {
    const addRes = await request(app.getHttpServer())
      .post("/customer-auth/me/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "البيت", addressDetails: "شارع 1، عمارة 2", isDefault: true });
    expect(addRes.status).toBe(201);
    expect(addRes.body.isDefault).toBe(true);

    const listRes = await request(app.getHttpServer()).get("/customer-auth/me/addresses").set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].addressDetails).toBe("شارع 1، عمارة 2");
  });
});
