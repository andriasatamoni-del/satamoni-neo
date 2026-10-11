import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE, KYSELY } from "../../../src/shared/database/database.module";
import { CUSTOMER_TOKEN_SERVICE } from "../../../src/contexts/customers/domain/ports/customer-token.service.port";
import { eq, inArray } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { comboItems, combos, menuCategories, menuItemModifierVariantPrices, menuItemModifiers, menuItemVariants, menuItems, recipeIngredients, recipeVersions, recipes } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { customers } from "../../../src/contexts/customers/infrastructure/persistence/customers.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { loyaltyRewards } from "../../../src/contexts/loyalty/infrastructure/persistence/loyalty.tables";
import { orderItemModifiers, orderItems, orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { paymentMethods, payments } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-control.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";
import { posSettings } from "../../../src/contexts/settings/infrastructure/persistence/settings.tables";
import { treasuries } from "../../../src/contexts/treasury/infrastructure/persistence/treasury.tables";
import type { Database } from "../../../src/shared/database/database.token";

// STORE-1/2: موقع الطلب أونلاين بحساب إلزامي - من المنيو العام، للتسجيل مرة واحدة بالعنوان، للطلب بضغطة،
// لحد الكاشير والمطبخ والتتبّع ونقاط الولاء (كسب بعد التسليم + صرف في مكافأة)
describe("Storefront - موقع الطلب أونلاين (e2e)", () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  let addressId: string;
  let branchId: string;
  let dineInBranchId: string;
  let categoryId: string;
  let itemId: string;
  let smallId: string;
  let largeId: string;
  let modifierId: string;
  let comboId: string;
  let exclusiveComboId: string;
  let cashMethodId: string;
  let ingredientId: string;
  let scarceVariantId: string;
  const rewardIds: Record<string, string> = {};
  const phone = "01055550001";
  const incompletePhone = "01055550002";
  const blockedPhone = "01055550003";
  const ADDRESS = { area: "المعادي", street: "شارع 9", building: "12", floor: "3", apartment: "5", distinguishingMark: "بوابة خضرا" };

  const server = () => app.getHttpServer();
  const staff = () => ({ Authorization: `Bearer ${adminToken}` });
  const customer = () => ({ Authorization: `Bearer ${customerToken}` });

  async function setSettings(body: Record<string, unknown>) {
    const res = await request(server()).patch("/pos-settings").set(staff()).send(body);
    expect(res.status).toBe(200);
  }

  function order(overrides: Record<string, unknown> = {}) {
    return {
      clientRequestId: randomUUID(),
      branchId,
      orderType: "delivery",
      addressId,
      notes: "من غير بصل",
      items: [
        { variantId: largeId, quantity: 2, modifierIds: [modifierId] },
        { comboId, quantity: 1 },
      ],
      ...overrides,
    };
  }

  const place = (body: Record<string, unknown>, auth: Record<string, string> = customer()) => request(server()).post("/storefront/orders").set(auth).send(body);
  const balance = async () => (await request(server()).get("/loyalty/me").set(customer())).body.balance as number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const db = app.get(KYSELY);

    const { UserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { BranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { MenuCategoryRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/menu-category.repository");
    const { MenuCategory } = await import("../../../src/contexts/catalog/domain/menu-category.aggregate");
    const { MenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
    const { ComboRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/combo.repository");
    const { Combo } = await import("../../../src/contexts/catalog/domain/combo.aggregate");
    const { KyselyPaymentMethodRepository } = await import("../../../src/contexts/payment-control/infrastructure/persistence/kysely-payment-method.repository");
    const { PaymentMethod } = await import("../../../src/contexts/payment-control/domain/payment-method.aggregate");
    const { InventoryItemRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository");
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { RecipeRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/recipe.repository");
    const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");

    await new UserRepository(app.get<Database>(DATABASE)).save(
      User.register({ name: "أدمن-موقع-جست", email: "admin-store@jest.test", passwordHash: await new BcryptPasswordHasher().hash("12345678"), role: "admin" })
    );
    adminToken = (await request(server()).post("/auth/login").send({ email: "admin-store@jest.test", password: "12345678" })).body.token;

    const branchRepo = new BranchRepository(app.get<Database>(DATABASE));
    const branch = Branch.register({ name: "فرع-موقع-جست", phone: "0223456789", lat: 30.05, lng: 31.23, supportsDineIn: false });
    const dineIn = Branch.register({ name: "فرع-موقع-صالة-جست", supportsDineIn: true });
    await branchRepo.save(branch);
    await branchRepo.save(dineIn);
    branchId = branch.id;
    dineInBranchId = dineIn.id;

    const category = MenuCategory.register({ name: "قسم-موقع-جست", displayOrder: -100 });
    await new MenuCategoryRepository(app.get<Database>(DATABASE)).save(category);
    categoryId = category.id;

    const itemRepo = new MenuItemRepository(app.get<Database>(DATABASE));
    const item = MenuItem.register({ name: "بيتزا-موقع-جست", categoryId, description: "بالجبنة", isBest: true, imageUrl: "/media/images/pizza" });
    smallId = item.addVariant({ label: "صغير", price: 60 }).id;
    largeId = item.addVariant({ label: "كبير", price: 100 }).id;
    modifierId = item.addModifier({ name: "جبنة زيادة", priceDelta: 10 }).id;
    item.setModifierVariantPrice(modifierId, largeId, 15);
    await itemRepo.save(item);
    itemId = item.id;

    const hidden = MenuItem.register({ name: "صنف-موقوف-موقع-جست", categoryId });
    hidden.addVariant({ label: "عادي", price: 40 });
    hidden.deactivate();
    await itemRepo.save(hidden);

    const scarce = MenuItem.register({ name: "صنف-ناقص-موقع-جست", categoryId });
    scarceVariantId = scarce.addVariant({ label: "عادي", price: 30 }).id;
    await itemRepo.save(scarce);
    const ingredient = InventoryItem.register({ name: "مكوّن-ناقص-موقع-جست", unit: "كيلو", negativeStockPolicy: "STRICT" });
    await new InventoryItemRepository(app.get<Database>(DATABASE)).save(ingredient);
    ingredientId = ingredient.id;
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: scarceVariantId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId: ingredientId, quantity: 1 });
    recipe.activateVersion(version.id);
    await new RecipeRepository(app.get<Database>(DATABASE)).save(recipe);

    const comboRepo = new ComboRepository(app.get<Database>(DATABASE));
    const combo = Combo.register({ name: "عرض-موقع-جست", price: 150, items: [{ variantId: smallId, quantity: 2 }] });
    const exclusive = Combo.register({
      name: "عرض-حصري-موقع-جست", price: 99, items: [{ variantId: smallId, quantity: 1 }],
      onlineOnly: true, description: "للموقع بس", imageUrl: "/media/images/exclusive",
    });
    await comboRepo.save(combo);
    await comboRepo.save(exclusive);
    comboId = combo.id;
    exclusiveComboId = exclusive.id;

    const cash = PaymentMethod.register({ name: "كاش-موقع-جست", kind: "cash", settlementChannel: null });
    await new KyselyPaymentMethodRepository(db).save(cash);
    cashMethodId = cash.id;

    const reg = await request(server())
      .post("/customer-auth/register")
      .send({ phone, phone2: "01155550001", email: "store-customer@jest.test", name: "عميل الموقع", password: "123456", address: ADDRESS });
    expect(reg.status).toBe(201);
    customerToken = reg.body.token;
    addressId = (await request(server()).get("/customer-auth/me/addresses").set(customer())).body[0].id;

    await setSettings({ loyaltyPointsPerEgp: 0.1 });
    for (const [key, body] of Object.entries({
      discount: { name: "خصم 20 جنيه", pointsCost: 50, kind: "discount", discountAmount: 20 },
      bigDiscount: { name: "خصم 1000 جنيه", pointsCost: 60, kind: "discount", discountAmount: 1000 },
      freeItem: { name: "بيتزا صغيرة هدية", pointsCost: 30, kind: "free_item", variantId: smallId },
      freeCombo: { name: "عرض هدية", pointsCost: 400, kind: "free_combo", comboId },
    })) {
      const res = await request(server()).post("/loyalty/rewards").set(staff()).send(body);
      expect(res.status).toBe(201);
      rewardIds[key] = res.body.id;
    }
  });

  afterAll(async () => {
    const database = app.get<Database>(DATABASE);
    await request(server()).patch("/pos-settings").set(staff()).send({ onlineOrderingEnabled: false });
    await database.update(posSettings).set({ updated_by: null });
    const phones = [phone, incompletePhone, blockedPhone];
    await database.delete(customers).where(inArray(customers.phone, phones));
    await database.delete(loyaltyRewards).where(inArray(loyaltyRewards.id, Object.values(rewardIds)));
    for (const b of [branchId, dineInBranchId]) {
      await database.delete(payments).where(eq(payments.branch_id, b));
      await database.delete(printJobs).where(eq(printJobs.branch_id, b));
      await database.delete(orderItemModifiers).where(inArray(orderItemModifiers.order_item_id, database.select({ id: orderItems.id }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.order_id)).where(eq(orders.branch_id, b))));
      await database.delete(orderItems).where(inArray(orderItems.order_id, database.select({ id: orders.id }).from(orders).where(eq(orders.branch_id, b))));
      await database.delete(stockMovements).where(eq(stockMovements.branch_id, b));
      await database.delete(branchStockBalances).where(eq(branchStockBalances.branch_id, b));
      await database.delete(orders).where(eq(orders.branch_id, b));
      await database.delete(treasuries).where(eq(treasuries.branch_id, b));
      await database.delete(branches).where(eq(branches.id, b));
    }
    await database.delete(paymentMethods).where(eq(paymentMethods.id, cashMethodId));
    await database.delete(comboItems).where(inArray(comboItems.combo_id, [comboId, exclusiveComboId]));
    await database.delete(combos).where(inArray(combos.id, [comboId, exclusiveComboId]));
    await database.delete(recipeIngredients).where(eq(recipeIngredients.ingredient_item_id, ingredientId));
    await database.delete(recipeVersions).where(inArray(recipeVersions.recipe_id, database.select({ id: recipes.id }).from(recipes).where(eq(recipes.variant_id, scarceVariantId))));
    await database.delete(recipes).where(eq(recipes.variant_id, scarceVariantId));
    await database.delete(inventoryItems).where(eq(inventoryItems.id, ingredientId));
    await database.delete(menuItemModifierVariantPrices).where(eq(menuItemModifierVariantPrices.modifier_id, modifierId));
    await database.delete(menuItemModifiers).where(eq(menuItemModifiers.item_id, itemId));
    await database.delete(menuItemVariants).where(inArray(menuItemVariants.item_id, database.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.category_id, categoryId))));
    await database.delete(menuItems).where(eq(menuItems.category_id, categoryId));
    await database.delete(menuCategories).where(eq(menuCategories.id, categoryId));
    await database.delete(users).where(eq(users.email, "admin-store@jest.test"));
    await app.close();
  });

  test("GET /storefront/menu: عام - أصناف بصورها وأسعار الإضافات لكل حجم، العروض (الحصري أولًا)، المكافآت ونسبة الكسب", async () => {
    const res = await request(server()).get("/storefront/menu");
    expect(res.status).toBe(200);
    expect(res.body.orderingEnabled).toBe(false);

    const category = res.body.categories.find((c: { id: string }) => c.id === categoryId);
    expect(category.items.map((i: { name: string }) => i.name)).not.toContain("صنف-موقوف-موقع-جست");
    const pizza = category.items.find((i: { id: string }) => i.id === itemId);
    expect(pizza).toMatchObject({ description: "بالجبنة", isBest: true, imageUrl: "/media/images/pizza" });
    expect(pizza.modifiers[0].prices).toEqual({ [smallId]: 10, [largeId]: 15 });

    const ours = res.body.combos.filter((c: { id: string }) => [comboId, exclusiveComboId].includes(c.id));
    expect(ours[0]).toMatchObject({ id: exclusiveComboId, onlineOnly: true, description: "للموقع بس", imageUrl: "/media/images/exclusive" });

    expect(res.body.loyalty.pointsPerEgp).toBe(0.1);
    const freeItem = res.body.loyalty.rewards.find((r: { id: string }) => r.id === rewardIds.freeItem);
    expect(freeItem).toMatchObject({ kind: "free_item", pointsCost: 30, targetName: "بيتزا-موقع-جست (صغير)", value: 60, imageUrl: "/media/images/pizza" });
  });

  test("الطلب محتاج حساب (401)، ولو الطلب أونلاين مقفول -> 503", async () => {
    expect((await place(order(), {} as Record<string, string>)).status).toBe(401);
    const closed = await place(order());
    expect(closed.status).toBe(503);
    await setSettings({ onlineOrderingEnabled: true });
  });

  let orderId: string;
  let trackingToken: string;

  test("طلب توصيل بضغطة: الاسم والتليفونين والعنوان من الحساب، أسعار السيرفر، مصدر website، وبيوصل للمطبخ والكاشير", async () => {
    const res = await place(order());
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(380); // (100 + 15) × 2 + عرض 150
    orderId = res.body.orderId;
    trackingToken = res.body.trackingToken;

    const staffOrder = (await request(server()).get(`/orders?branchId=${branchId}`).set(staff())).body.find((o: { id: string }) => o.id === orderId);
    expect(staffOrder).toMatchObject({
      source: "website",
      customerName: "عميل الموقع",
      customerPhone: phone,
      addressDetails: "المعادي - شارع 9 - عمارة 12 - الدور 3 - شقة 5 - علامة مميزة: بوابة خضرا - تليفون تاني: 01155550001",
      customerNotes: "من غير بصل",
      paymentMethodId: cashMethodId,
    });
    const board = await request(server()).get(`/orders/kitchen-board?branchId=${branchId}`).set(staff());
    expect(board.body.map((o: { id: string }) => o.id)).toContain(orderId);
  });

  test("التوصيل لازم عنوان من دفتر العميل - من غير عنوان أو بعنوان مش بتاعه = 400", async () => {
    expect((await place(order({ addressId: undefined }))).body.error).toBe("اختار عنوان التوصيل من عناوينك");
    expect((await place(order({ addressId: randomUUID() }))).status).toBe(400);
    const pickup = await place(order({ orderType: "takeaway", addressId: undefined, items: [{ variantId: smallId, quantity: 1 }] }));
    expect(pickup.status).toBe(201);
  });

  test("حساب قديم ناقصه إيميل/رقم تاني/عنوان -> لازم يكمّل بياناته قبل أول طلب", async () => {
    const db = app.get<Database>(DATABASE);
    const id = randomUUID();
    await db.insert(customers).values({ id: id, phone: incompletePhone, name: "عميل قديم", loyalty_points: 0, password_hash: "x" });
    const token = app.get(CUSTOMER_TOKEN_SERVICE).sign({ sub: id });
    const me = await request(server()).get("/customer-auth/me").set({ Authorization: `Bearer ${token}` });
    expect(me.body.missingProfileFields).toEqual(["email", "phone2", "address"]);
    const res = await place(order({ orderType: "takeaway", addressId: undefined }), { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("كمّل بياناتك");
  });

  test("نقاط الولاء: الكسب بعد التسليم بس (إجمالي × النسبة)، مرة واحدة لكل طلب", async () => {
    expect(await balance()).toBe(0);
    await request(server()).patch(`/orders/${orderId}/status`).set(staff()).send({ status: "out_for_delivery" });
    expect(await balance()).toBe(0);
    await request(server()).patch(`/orders/${orderId}/status`).set(staff()).send({ status: "completed" });
    expect(await balance()).toBe(38); // 380 × 0.1

    const loyalty = (await request(server()).get("/loyalty/me").set(customer())).body;
    expect(loyalty.history[0]).toMatchObject({ kind: "earn", points: 38, orderId });
    expect(loyalty.rewards.find((r: { id: string }) => r.id === rewardIds.freeItem).affordable).toBe(true);
    expect(loyalty.rewards.find((r: { id: string }) => r.id === rewardIds.discount).affordable).toBe(false);
  });

  test("صرف نقاط في صنف هدية: السطر بيتضاف، خصم بسعره، النقاط بتتخصم، والمطبخ بيعرف إنها هدية", async () => {
    const body = order({ orderType: "takeaway", addressId: undefined, rewardId: rewardIds.freeItem, items: [{ variantId: largeId, quantity: 1 }] });
    const res = await place(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ total: 100, discount: 60 });
    expect(await balance()).toBe(8);

    // نفس الطلب اتبعت تاني (النت فصل) - نفس الطلب ومفيش خصم نقاط تاني
    const replay = await place(body);
    expect(replay.body.orderId).toBe(res.body.orderId);
    expect(await balance()).toBe(8);

    const tracked = await request(server()).get(`/storefront/orders/${res.body.orderId}?token=${res.body.trackingToken}`);
    expect(tracked.body.lines.map((l: { name: string; variantLabel: string }) => `${l.name}:${l.variantLabel}`)).toEqual(
      expect.arrayContaining(["بيتزا-موقع-جست:كبير", "بيتزا-موقع-جست:صغير"])
    );
    expect(tracked.body.customerNotes).toContain("🎁 مكافأة نقاط: بيتزا صغيرة هدية");

    // الطلب اتلغى -> النقاط بترجع
    const cancel = await request(server()).patch(`/orders/${res.body.orderId}/cancel`).set(staff());
    expect(cancel.status).toBe(200);
    expect(await balance()).toBe(38);
    const history = (await request(server()).get("/loyalty/me").set(customer())).body.history;
    expect(history.map((h: { kind: string }) => h.kind)).toEqual(expect.arrayContaining(["redeem", "refund_redeem"]));
  });

  test("نقاط مش كفاية -> 409 ومفيش طلب ولا خصم؛ خصم أكبر من الطلب بيخلّيه ببلاش مش بالسالب", async () => {
    const poor = await place(order({ rewardId: rewardIds.freeCombo }));
    expect(poor.status).toBe(409);
    expect(poor.body.error).toContain("نقاطك مش كفاية");
    expect(await balance()).toBe(38);

    const db = app.get<Database>(DATABASE);
    await db.update(customers).set({ loyalty_points: 100 }).where(eq(customers.phone, phone));
    const free = await place(order({ orderType: "takeaway", addressId: undefined, rewardId: rewardIds.bigDiscount, items: [{ variantId: smallId, quantity: 1 }] }));
    expect(free.status).toBe(201);
    expect(free.body).toMatchObject({ total: 0, discount: 60 });
    expect(await balance()).toBe(40);
  });

  test("فشل الطلب بعد حجز النقاط (مخزون ناقص) -> النقاط بترجع", async () => {
    const res = await place(order({ rewardId: rewardIds.freeItem, items: [{ variantId: scarceVariantId, quantity: 1 }] }));
    expect(res.status).toBe(409);
    expect(res.body.error).not.toContain("مكوّن-ناقص");
    expect(await balance()).toBe(40);
  });

  test("العرض الحصري: بيتطلب من الموقع، ومرفوض من الكاشير", async () => {
    const online = await place(order({ orderType: "takeaway", addressId: undefined, items: [{ comboId: exclusiveComboId, quantity: 1 }] }));
    expect(online.status).toBe(201);
    expect(online.body.total).toBe(99);
    const pos = await request(server()).post("/orders").set(staff()).send({ branchId, orderType: "takeaway", items: [{ comboId: exclusiveComboId, quantity: 1 }] });
    expect(pos.status).toBe(400);
  });

  test("صالة بترابيزة (QR)، ورقم محظور 403", async () => {
    const noDineIn = await place(order({ orderType: "dinein", tableNumber: "3", addressId: undefined }));
    expect(noDineIn.status).toBe(400);
    const dinein = await place(order({ branchId: dineInBranchId, orderType: "dinein", tableNumber: "3", addressId: undefined, items: [{ variantId: smallId, quantity: 1 }] }));
    expect(dinein.status).toBe(201);

    const db = app.get<Database>(DATABASE);
    await db.update(customers).set({ is_blocked: true }).where(eq(customers.phone, phone));
    expect((await place(order())).status).toBe(403);
    await db.update(customers).set({ is_blocked: false }).where(eq(customers.phone, phone));
  });

  test("التتبّع بالتوكن، و'طلباتي' بطلبات الحساب بس", async () => {
    const tracked = await request(server()).get(`/storefront/orders/${orderId}?token=${trackingToken}`);
    expect(tracked.body).toMatchObject({ status: "completed", total: 380, branch: { name: "فرع-موقع-جست" } });
    expect((await request(server()).get(`/storefront/orders/${orderId}?token=${randomUUID()}`)).status).toBe(404);
    const mine = await request(server()).get("/storefront/me/orders").set(customer());
    expect(mine.body.length).toBeGreaterThanOrEqual(5);
    expect(mine.body.every((o: { customerName: string }) => o.customerName === "عميل الموقع")).toBe(true);
  });

  test("إدارة المكافآت: تحقق النوع والهدف، والعميل مايقدرش يوصل لها", async () => {
    const bad = await request(server()).post("/loyalty/rewards").set(staff()).send({ name: "ناقص", pointsCost: 10, kind: "free_item" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("اختار الصنف والحجم الهدية");
    expect((await request(server()).get("/loyalty/rewards").set(customer())).status).toBe(401);
    const off = await request(server())
      .patch(`/loyalty/rewards/${rewardIds.freeCombo}`)
      .set(staff())
      .send({ name: "عرض هدية", pointsCost: 400, kind: "free_combo", comboId, isActive: false });
    expect(off.body.isActive).toBe(false);
    const menu = await request(server()).get("/storefront/menu");
    expect(menu.body.loyalty.rewards.map((r: { id: string }) => r.id)).not.toContain(rewardIds.freeCombo);
  });

  test("إعدادات النظام: التقفيل بيوقف الطلبات تاني", async () => {
    await setSettings({ onlineOrderingEnabled: false });
    expect((await place(order())).status).toBe(503);
  });
});
