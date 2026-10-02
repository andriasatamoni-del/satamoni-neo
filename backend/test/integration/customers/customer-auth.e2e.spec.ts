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
  const ADDRESS = { area: "المعادي", street: "شارع 9", building: "12", floor: "3", apartment: "5" };
  const signup = (overrides: Record<string, unknown> = {}) => ({
    phone, phone2: "01199998888", email: "customer-auth@jest.test", name: "عميل-جست", password: "123456", address: ADDRESS, ...overrides,
  });

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
      .send(signup());
    expect(res.status).toBe(201);
    expect(res.body.customer).toMatchObject({ email: "customer-auth@jest.test", phone2: "01199998888", missingProfileFields: [] });
    expect(res.body.token).toBeTruthy();
    expect(res.body.customer.phone).toBe(phone);
    expect(res.body.customer.name).toBe("عميل-جست");
    token = res.body.token;
  });

  test("POST /customer-auth/register بنفس الرقم تاني -> 409", async () => {
    const res = await request(app.getHttpServer())
      .post("/customer-auth/register")
      .send(signup({ name: "عميل تاني", email: "other@jest.test" }));
    expect(res.status).toBe(409);
  });

  test("POST /customer-auth/register بكلمة سر قصيرة -> 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/customer-auth/register")
      .send(signup({ phone: "01011112222", email: "short@jest.test", password: "123" }));
    expect(res.status).toBe(400);
  });

  test("POST /customer-auth/register: الرقم التاني والإيميل والعنوان إلزاميين، وإيميل مستخدم -> 409", async () => {
    const server = app.getHttpServer();
    const other = { phone: "01011113333" };
    expect((await request(server).post("/customer-auth/register").send(signup({ ...other, phone2: undefined }))).status).toBe(400);
    expect((await request(server).post("/customer-auth/register").send(signup({ ...other, email: "bad" }))).body.error).toBe("الإيميل غير صالح");
    const noFloor = await request(server).post("/customer-auth/register").send(signup({ ...other, email: "x1@jest.test", address: { ...ADDRESS, floor: "" } }));
    expect(noFloor.status).toBe(400);
    expect(noFloor.body.error).toBe("لازم الدور في العنوان");
    const dupEmail = await request(server).post("/customer-auth/register").send(signup({ ...other, email: "CUSTOMER-AUTH@jest.test" }));
    expect(dupEmail.status).toBe(409);
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
      .send(signup({ phone: guestPhone, email: "guest-upgrade@jest.test", name: "عميل حقيقي دلوقتي" }));
    expect(res.status).toBe(201);
    expect(res.body.customer.loyaltyPoints).toBe(30);
    expect(res.body.customer.name).toBe("عميل حقيقي دلوقتي");
  });

  test("دفتر العناوين: إضافة عنوان مقسّم، تغيير الافتراضي، حذف", async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const addRes = await request(app.getHttpServer())
      .post("/customer-auth/me/addresses")
      .set(auth)
      .send({ label: "الشغل", area: "مدينة نصر", street: "عباس العقاد", building: "7", floor: "2", apartment: "4" });
    expect(addRes.status).toBe(201);
    expect(addRes.body).toMatchObject({ isDefault: false, addressDetails: "مدينة نصر - عباس العقاد - عمارة 7 - الدور 2 - شقة 4" });

    let list = await request(app.getHttpServer()).get("/customer-auth/me/addresses").set(auth);
    expect(list.body).toHaveLength(2);
    expect(list.body.find((a: { isDefault: boolean }) => a.isDefault).area).toBe("المعادي");

    const def = await request(app.getHttpServer()).post(`/customer-auth/me/addresses/${addRes.body.id}/default`).set(auth);
    expect(def.status).toBe(200);
    expect(def.body.find((a: { isDefault: boolean }) => a.isDefault).id).toBe(addRes.body.id);

    const del = await request(app.getHttpServer()).delete(`/customer-auth/me/addresses/${addRes.body.id}`).set(auth);
    expect(del.body).toHaveLength(1);
    expect(del.body[0].isDefault).toBe(true);
    list = await request(app.getHttpServer()).get("/customer-auth/me/addresses").set(auth);
    expect(list.body).toHaveLength(1);
  });

  test("PATCH /customer-auth/me بيعدّل الاسم والإيميل والرقم التاني", async () => {
    const res = await request(app.getHttpServer())
      .patch("/customer-auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "اسم جديد", email: "new-mail@jest.test", phone2: "01233334444" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "اسم جديد", email: "new-mail@jest.test", phone2: "01233334444" });
    const dup = await request(app.getHttpServer())
      .patch("/customer-auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "guest-upgrade@jest.test" });
    expect(dup.status).toBe(409);
  });
});
