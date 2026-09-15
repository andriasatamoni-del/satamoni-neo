import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../../src/shared/database/database.types";
import { KyselyUserRepository } from "../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository";
import { User } from "../../../src/contexts/identity-access/domain/user.aggregate";

describe("KyselyUserRepository", () => {
  let db: Kysely<Database>;
  let repo: KyselyUserRepository;

  beforeAll(() => {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    // بنعمل instance يدوي هنا بدل ما نقلع كل Nest module، عشان اختبار التخزين نفسه بس من غير
    // الحاجة لباقي التطبيق (نفس الـconnection type اللي DatabaseModule بيستخدمه فعليًا)
    repo = new KyselyUserRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    await db.deleteFrom("users").execute();
  });

  test("save بيسجّل يوزر جديد، وfindById بيرجّعه بنفس البيانات", async () => {
    const user = User.register({
      name: "أحمد الكاشير",
      email: "ahmed-repo@jest.test",
      passwordHash: "hashed-pw",
      role: "cashier",
    });
    await repo.save(user);

    const found = await repo.findById(user.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("أحمد الكاشير");
    expect(found!.email).toBe("ahmed-repo@jest.test");
    expect(found!.role).toBe("cashier");
    expect(found!.isActive).toBe(true);
    expect(found!.permissionGrants).toEqual([]);
  });

  test("findByEmail بيرجّع null لو مفيش يوزر بالإيميل ده", async () => {
    const found = await repo.findByEmail("nobody@jest.test");
    expect(found).toBeNull();
  });

  test("existsByEmail بيرجع صح/غلط صح", async () => {
    const user = User.register({ name: "أ", email: "exists-repo@jest.test", passwordHash: "h", role: "cashier" });
    await repo.save(user);
    expect(await repo.existsByEmail("exists-repo@jest.test")).toBe(true);
    expect(await repo.existsByEmail("nope-repo@jest.test")).toBe(false);
  });

  test("save تاني على نفس الـid بيعمل update (upsert) مش صف جديد", async () => {
    const user = User.register({ name: "أ", email: "upsert-repo@jest.test", passwordHash: "h", role: "cashier" });
    await repo.save(user);

    user.grantPermission("orders.cancel");
    await repo.save(user);

    const found = await repo.findById(user.id);
    expect(found!.permissionGrants).toEqual(["orders.cancel"]);

    const all = await repo.list();
    expect(all.filter((u) => u.id === user.id).length).toBe(1);
  });

  test("findByLegacyUserId بيلاقي اليوزر المستورد من الريبو القديم بكود الـid بتاعه هناك", async () => {
    const user = User.register({
      name: "أ", email: "legacy-repo@jest.test", passwordHash: "h", role: "cashier", legacyUserId: 42,
    });
    await repo.save(user);

    const found = await repo.findByLegacyUserId(42);
    expect(found?.id).toBe(user.id);
    expect(await repo.findByLegacyUserId(999)).toBeNull();
  });

  test("list بيفلتر بالفرع صح", async () => {
    const branchId = "11111111-1111-1111-1111-111111111111";
    const inBranch = User.register({ name: "فرع", email: "inbranch-repo@jest.test", passwordHash: "h", role: "cashier", branchId });
    const noBranch = User.register({ name: "بدون فرع", email: "nobranch-repo@jest.test", passwordHash: "h", role: "admin" });
    await repo.save(inBranch);
    await repo.save(noBranch);

    const scoped = await repo.list({ branchId });
    expect(scoped.map((u) => u.id)).toEqual([inBranch.id]);

    const unscoped = await repo.list({ branchId: null });
    expect(unscoped.map((u) => u.id)).toEqual([noBranch.id]);
  });
});
