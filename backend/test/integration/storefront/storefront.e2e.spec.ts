import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

// STORE-1: موقع الطلب أونلاين (نفس public/order.html في الريبو القديم) - من المنيو العام لحد ما الطلب
// يوصل شاشة المطبخ والكاشير ويتتبّع من العميل
describe("Storefront - موقع الطلب أونلاين (e2e)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let dineInBranchId: string;
  let categoryId: string;
  let itemId: string;
  let smallId: string;
  let largeId: string;
  let modifierId: string;
  let hiddenItemId: string;
  let comboId: string;
  let cashMethodId: string;
  let ingredientId: string;
  let scarceVariantId: string;
  const accountPhone = "01055550001";
  const guestPhone = "01055550002";
  const blockedPhone = "01055550003";

  const server = () => app.getHttpServer();
  const staff = () => ({ Authorization: `Bearer ${adminToken}` });

  async function setOrdering(enabled: boolean) {
    const res = await request(server()).patch("/pos-settings").set(staff()).send({ onlineOrderingEnabled: enabled });
    expect(res.status).toBe(200);
  }

  function guestOrder(overrides: Record<string, unknown> = {}) {
    return {
      clientRequestId: randomUUID(),
      branchId,
      orderType: "delivery",
      customerName: "ضيف الموقع",
      customerPhone: guestPhone,
      addressDetails: "شارع الموقع 5",
      distinguishingMark: "بوابة خضرا",
      notes: "من غير بصل",
      items: [
        { variantId: largeId, quantity: 2, modifierIds: [modifierId] },
        { comboId, quantity: 1 },
      ],
      ...overrides,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const db = app.get(KYSELY);

    const { KyselyUserRepository } = await import("../../../src/contexts/identity-access/infrastructure/persistence/kysely-user.repository");
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import("../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher");
    const { KyselyBranchRepository } = await import("../../../src/contexts/branches/infrastructure/persistence/kysely-branch.repository");
    const { Branch } = await import("../../../src/contexts/branches/domain/branch.aggregate");
    const { KyselyMenuCategoryRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-category.repository");
    const { MenuCategory } = await import("../../../src/contexts/catalog/domain/menu-category.aggregate");
    const { KyselyMenuItemRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository");
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
    const { KyselyComboRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-combo.repository");
    const { Combo } = await import("../../../src/contexts/catalog/domain/combo.aggregate");
    const { KyselyPaymentMethodRepository } = await import("../../../src/contexts/payment-control/infrastructure/persistence/kysely-payment-method.repository");
    const { PaymentMethod } = await import("../../../src/contexts/payment-control/domain/payment-method.aggregate");
    const { KyselyCustomerRepository } = await import("../../../src/contexts/customers/infrastructure/persistence/kysely-customer.repository");
    const { Customer } = await import("../../../src/contexts/customers/domain/customer.aggregate");
    const { KyselyInventoryItemRepository } = await import("../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository");
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { KyselyRecipeRepository } = await import("../../../src/contexts/catalog/infrastructure/persistence/kysely-recipe.repository");
    const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");

    await new KyselyUserRepository(db).save(
      User.register({ name: "أدمن-موقع-جست", email: "admin-store@jest.test", passwordHash: await new BcryptPasswordHasher().hash("12345678"), role: "admin" })
    );
    adminToken = (await request(server()).post("/auth/login").send({ email: "admin-store@jest.test", password: "12345678" })).body.token;

    const branchRepo = new KyselyBranchRepository(db);
    const branch = Branch.register({ name: "فرع-موقع-جست", phone: "0223456789", lat: 30.05, lng: 31.23, supportsDineIn: false });
    const dineIn = Branch.register({ name: "فرع-موقع-صالة-جست", supportsDineIn: true });
    await branchRepo.save(branch);
    await branchRepo.save(dineIn);
    branchId = branch.id;
    dineInBranchId = dineIn.id;

    const category = MenuCategory.register({ name: "قسم-موقع-جست", displayOrder: -100 });
    await new KyselyMenuCategoryRepository(db).save(category);
    categoryId = category.id;

    const itemRepo = new KyselyMenuItemRepository(db);
    const item = MenuItem.register({ name: "بيتزا-موقع-جست", categoryId, description: "بالجبنة", isBest: true });
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
    hiddenItemId = hidden.id;

    const scarce = MenuItem.register({ name: "صنف-ناقص-موقع-جست", categoryId });
    scarceVariantId = scarce.addVariant({ label: "عادي", price: 30 }).id;
    await itemRepo.save(scarce);
    const ingredient = InventoryItem.register({ name: "مكوّن-ناقص-موقع-جست", unit: "كيلو", negativeStockPolicy: "STRICT" });
    await new KyselyInventoryItemRepository(db).save(ingredient);
    ingredientId = ingredient.id;
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: scarceVariantId });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId: ingredientId, quantity: 1 });
    recipe.activateVersion(version.id);
    await new KyselyRecipeRepository(db).save(recipe);

    const combo = Combo.register({ name: "عرض-موقع-جست", price: 150, items: [{ variantId: smallId, quantity: 2 }] });
    await new KyselyComboRepository(db).save(combo);
    comboId = combo.id;

    const cash = PaymentMethod.register({ name: "كاش-موقع-جست", kind: "cash", settlementChannel: null });
    await new KyselyPaymentMethodRepository(db).save(cash);
    cashMethodId = cash.id;

    const customerRepo = new KyselyCustomerRepository(db);
    const blocked = Customer.register({ phone: blockedPhone, name: "محظور", passwordHash: "x" });
    blocked.block({ reason: "طلبات وهمية", blockedBy: null });
    await customerRepo.save(blocked);
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await request(server()).patch("/pos-settings").set(staff()).send({ onlineOrderingEnabled: false });
    await sql`UPDATE pos_settings SET updated_by = NULL`.execute(db);
    const branches = [branchId, dineInBranchId];
    for (const b of branches) {
      await sql`DELETE FROM payments WHERE branch_id = ${b}`.execute(db);
      await sql`DELETE FROM print_jobs WHERE branch_id = ${b}`.execute(db);
      await sql`DELETE FROM order_item_modifiers WHERE order_item_id IN (SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.branch_id = ${b})`.execute(db);
      await sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE branch_id = ${b})`.execute(db);
      await sql`DELETE FROM orders WHERE branch_id = ${b}`.execute(db);
      await sql`DELETE FROM treasuries WHERE branch_id = ${b}`.execute(db);
      await sql`DELETE FROM branches WHERE id = ${b}`.execute(db);
    }
    await sql`DELETE FROM payment_methods WHERE id = ${cashMethodId}`.execute(db);
    await sql`DELETE FROM combo_items WHERE combo_id = ${comboId}`.execute(db);
    await sql`DELETE FROM combos WHERE id = ${comboId}`.execute(db);
    await sql`DELETE FROM recipe_ingredients WHERE ingredient_item_id = ${ingredientId}`.execute(db);
    await sql`DELETE FROM recipe_versions WHERE recipe_id IN (SELECT id FROM recipes WHERE variant_id = ${scarceVariantId})`.execute(db);
    await sql`DELETE FROM recipes WHERE variant_id = ${scarceVariantId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id = ${ingredientId}`.execute(db);
    await sql`DELETE FROM menu_item_modifier_variant_prices WHERE modifier_id = ${modifierId}`.execute(db);
    await sql`DELETE FROM menu_item_modifiers WHERE item_id = ${itemId}`.execute(db);
    await sql`DELETE FROM menu_item_variants WHERE item_id IN (SELECT id FROM menu_items WHERE category_id = ${categoryId})`.execute(db);
    await sql`DELETE FROM menu_items WHERE category_id = ${categoryId}`.execute(db);
    await sql`DELETE FROM menu_categories WHERE id = ${categoryId}`.execute(db);
    const phones = [accountPhone, guestPhone, blockedPhone];
    await sql`DELETE FROM customer_addresses WHERE customer_id IN (SELECT id FROM customers WHERE phone IN (${sql.join(phones)}))`.execute(db);
    await sql`DELETE FROM customers WHERE phone IN (${sql.join(phones)})`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-store@jest.test'`.execute(db);
    await app.close();
  });

  test("GET /storefront/menu: عام من غير توكن - أقسام/أصناف نشطة بأسعار الإضافات لكل حجم، والعروض والفروع", async () => {
    const res = await request(server()).get("/storefront/menu");
    expect(res.status).toBe(200);
    expect(res.body.orderingEnabled).toBe(false);
    expect(res.body.paymentMethods).toEqual([{ key: "cash", label: "كاش عند الاستلام" }]);

    const category = res.body.categories.find((c: { id: string }) => c.id === categoryId);
    const names = category.items.map((i: { name: string }) => i.name);
    expect(names).toContain("بيتزا-موقع-جست");
    expect(names).not.toContain("صنف-موقوف-موقع-جست");
    const pizza = category.items.find((i: { id: string }) => i.id === itemId);
    expect(pizza).toMatchObject({ description: "بالجبنة", isBest: true });
    expect(pizza.variants.map((v: { price: number }) => v.price)).toEqual([60, 100]);
    expect(pizza.modifiers[0].prices).toEqual({ [smallId]: 10, [largeId]: 15 });
    expect(res.body.combos.find((c: { id: string }) => c.id === comboId)).toMatchObject({ price: 150, items: [{ variantLabel: "صغير", quantity: 2 }] });
    expect(res.body.branches.find((b: { id: string }) => b.id === branchId)).toMatchObject({ phone: "0223456789", lat: 30.05, lng: 31.23 });
    expect(hiddenItemId).toBeTruthy();
  });

  test("الطلب أونلاين مقفول (الافتراضي) -> 503 ومفيش طلب اتسجّل", async () => {
    const res = await request(server()).post("/storefront/orders").send(guestOrder());
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("مقفول");
  });

  let guestOrderId: string;
  let guestToken: string;

  test("ضيف: الطلب بيتسجّل بأسعار السيرفر (مش العميل) + مصدر website + دفع كاش مقفول + المطبخ والكاشير بيشوفوه", async () => {
    await setOrdering(true);
    const body = guestOrder();
    const res = await request(server()).post("/storefront/orders").send({ ...body, items: body.items.map((i) => ({ ...i, unitPrice: 1 })) });
    expect(res.status).toBe(201);
    // (100 + 15 إضافة) × 2 + عرض 150 = 380
    expect(res.body.total).toBe(380);
    guestOrderId = res.body.orderId;
    guestToken = res.body.trackingToken;

    const staffOrders = await request(server()).get(`/orders?branchId=${branchId}`).set(staff());
    const order = staffOrders.body.find((o: { id: string }) => o.id === guestOrderId);
    expect(order).toMatchObject({
      source: "website",
      orderType: "delivery",
      customerPhone: guestPhone,
      customerNotes: "من غير بصل",
      addressDetails: "شارع الموقع 5 - علامة مميزة: بوابة خضرا",
      kitchenStatus: "NEW",
      paymentMethodId: cashMethodId,
    });

    const board = await request(server()).get(`/orders/kitchen-board?branchId=${branchId}`).set(staff());
    expect(board.body.map((o: { id: string }) => o.id)).toContain(guestOrderId);

    const db = app.get(KYSELY);
    const payment = await db.selectFrom("payments").selectAll().where("order_id", "=", guestOrderId).executeTakeFirst();
    expect(payment).toMatchObject({ method_kind: "cash", payment_method_id: cashMethodId });
    const printJobs = await db.selectFrom("print_jobs").select("print_type").where("order_id", "=", guestOrderId).execute();
    expect(printJobs.map((p: { print_type: string }) => p.print_type)).toContain("DELIVERY_SUMMARY");
  });

  test("نفس clientRequestId مرتين (العميل داس مرتين/النت فصل) -> نفس الطلب، مش طلب تاني", async () => {
    const body = guestOrder();
    const first = await request(server()).post("/storefront/orders").send(body);
    const second = await request(server()).post("/storefront/orders").send(body);
    expect(second.status).toBe(201);
    expect(second.body.orderId).toBe(first.body.orderId);
  });

  test("تتبّع الطلب بالتوكن: الحالة بتتحدّث مع المطبخ والتوصيل؛ توكن غلط = مش موجود", async () => {
    const track = () => request(server()).get(`/storefront/orders/${guestOrderId}?token=${guestToken}`);
    let res = await track();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "preparing", kitchenStatus: "NEW", total: 380, branch: { name: "فرع-موقع-جست", phone: "0223456789" }, rated: false });
    expect(res.body.lines).toEqual(
      expect.arrayContaining([
        { name: "بيتزا-موقع-جست", variantLabel: "كبير", quantity: 2, lineTotal: 230, modifiers: ["جبنة زيادة"] },
        { name: "عرض-موقع-جست", variantLabel: null, quantity: 1, lineTotal: 150, modifiers: [] },
      ])
    );
    expect(res.body.customerPhone).toBeUndefined();

    await request(server()).patch(`/orders/${guestOrderId}/kitchen-status`).set(staff()).send({ kitchenStatus: "ACCEPTED" });
    await request(server()).patch(`/orders/${guestOrderId}/status`).set(staff()).send({ status: "out_for_delivery" });
    res = await track();
    expect(res.body).toMatchObject({ kitchenStatus: "ACCEPTED", status: "out_for_delivery" });
    expect(res.body.kitchenAcceptedAt).toBeTruthy();

    expect((await request(server()).get(`/storefront/orders/${guestOrderId}?token=${randomUUID()}`)).status).toBe(404);
    expect((await request(server()).get(`/storefront/orders/${guestOrderId}`)).status).toBe(404);
    expect((await request(server()).get(`/storefront/orders/${randomUUID()}?token=${guestToken}`)).status).toBe(404);
  });

  test("عميل مسجّل: الطلب برقم الحساب (مش أي رقم يكتبه)، العنوان بيتحفظ، و'طلباتي' بترجّع طلباته بس", async () => {
    const reg = await request(server()).post("/customer-auth/register").send({ phone: accountPhone, name: "عميل الموقع", password: "123456" });
    const customerAuth = { Authorization: `Bearer ${reg.body.token}` };

    const res = await request(server())
      .post("/storefront/orders")
      .set(customerAuth)
      .send(guestOrder({ customerName: "", customerPhone: "01099999999", saveAddress: true, items: [{ variantId: smallId, quantity: 1 }] }));
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(60);

    const addresses = await request(server()).get("/customer-auth/me/addresses").set(customerAuth);
    expect(addresses.body).toEqual([expect.objectContaining({ addressDetails: "شارع الموقع 5", distinguishingMark: "بوابة خضرا", isDefault: true })]);

    // نفس العنوان تاني مابيتكررش
    await request(server()).post("/storefront/orders").set(customerAuth).send(guestOrder({ saveAddress: true, items: [{ variantId: smallId, quantity: 1 }] }));
    expect((await request(server()).get("/customer-auth/me/addresses").set(customerAuth)).body).toHaveLength(1);

    const mine = await request(server()).get("/storefront/me/orders").set(customerAuth);
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(2);
    // الاسم الفاضي بياخد اسم الحساب، واسم مكتوب (مستلم تاني مثلًا) بيفضل زي ما هو - الرقم دايمًا رقم الحساب
    expect(mine.body[1]).toMatchObject({ customerName: "عميل الموقع", source: "website" });
    expect(mine.body[0]).toMatchObject({ customerName: "ضيف الموقع" });
    expect(mine.body.map((o: { id: string }) => o.id)).not.toContain(guestOrderId);

    expect((await request(server()).get("/storefront/me/orders")).status).toBe(401);
    expect((await request(server()).post("/storefront/orders").set({ Authorization: "Bearer junk" }).send(guestOrder())).status).toBe(401);
  });

  test("استلام من الفرع وصالة بترابيزة (QR)", async () => {
    const pickup = await request(server()).post("/storefront/orders").send(guestOrder({ orderType: "takeaway", items: [{ variantId: smallId, quantity: 1 }] }));
    expect(pickup.status).toBe(201);

    const noDineIn = await request(server()).post("/storefront/orders").send(guestOrder({ orderType: "dinein", tableNumber: "3" }));
    expect(noDineIn.status).toBe(400);

    const dinein = await request(server())
      .post("/storefront/orders")
      .send(guestOrder({ branchId: dineInBranchId, orderType: "dinein", tableNumber: "3", items: [{ variantId: smallId, quantity: 1 }] }));
    expect(dinein.status).toBe(201);
    const tracked = await request(server()).get(`/storefront/orders/${dinein.body.orderId}?token=${dinein.body.trackingToken}`);
    expect(tracked.body).toMatchObject({ orderType: "dinein", tableNumber: "3", addressDetails: null });
  });

  test("رفض: رقم محظور (403)، صنف مخزونه مش كفاية (409 برسالة للعميل من غير اسم المكوّن)، إضافة من صنف تاني، فرع مش موجود", async () => {
    const blocked = await request(server()).post("/storefront/orders").send(guestOrder({ customerPhone: blockedPhone }));
    expect(blocked.status).toBe(403);

    const scarce = await request(server()).post("/storefront/orders").send(guestOrder({ items: [{ variantId: scarceVariantId, quantity: 1 }] }));
    expect(scarce.status).toBe(409);
    expect(scarce.body.error).not.toContain("مكوّن-ناقص");

    const foreignModifier = await request(server())
      .post("/storefront/orders")
      .send(guestOrder({ items: [{ variantId: scarceVariantId, quantity: 1, modifierIds: [modifierId] }] }));
    expect(foreignModifier.status).toBe(400);

    const noBranch = await request(server()).post("/storefront/orders").send(guestOrder({ branchId: randomUUID() }));
    expect(noBranch.status).toBe(400);

    const missingAddress = await request(server()).post("/storefront/orders").send(guestOrder({ addressDetails: "" }));
    expect(missingAddress.status).toBe(400);
    expect(missingAddress.body.error).toBe("اكتب العنوان بالتفصيل");
  });

  test("إعدادات النظام بترجّع الحالة، والتقفيل بيوقف الطلبات تاني", async () => {
    const settings = await request(server()).get("/pos-settings").set(staff());
    expect(settings.body.onlineOrderingEnabled).toBe(true);
    await setOrdering(false);
    expect((await request(server()).post("/storefront/orders").send(guestOrder())).status).toBe(503);
    expect((await request(server()).get("/storefront/menu")).body.orderingEnabled).toBe(false);
  });
});
