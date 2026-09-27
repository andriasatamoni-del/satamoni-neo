import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { AppModule } from "../../../src/app.module";
import { KYSELY } from "../../../src/shared/database/database.module";

describe("Reporting - GET /reports/action-center (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let negativeStockItemId: string;
  let missingCostItemId: string;
  let complaintId: string;
  let supplierInvoiceId: string;
  const today = new Date().toISOString().slice(0, 10);

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
    const { KyselyInventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/kysely-inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { KyselyMenuItemRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/kysely-menu-item.repository"
    );
    const { KyselyRecipeRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/kysely-recipe.repository"
    );
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
    const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");
    const { KyselyComplaintRepository } = await import(
      "../../../src/contexts/crm/infrastructure/persistence/kysely-complaint.repository"
    );
    const { Complaint } = await import("../../../src/contexts/crm/domain/complaint.aggregate");

    const db = app.get(KYSELY);
    const userRepo = new KyselyUserRepository(db);
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-مركز-تنبيهات-جست", email: "admin-actioncenter@jest.test", passwordHash: await hasher.hash("12345678"), role: "admin",
    });
    await userRepo.save(admin);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin-actioncenter@jest.test", password: "12345678" });
    adminToken = loginRes.body.token;

    const branchRes = await request(app.getHttpServer())
      .post("/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "فرع مركز-تنبيهات-جست" });
    branchId = branchRes.body.id;

    // 1) رصيد سالب: صنف ALLOW_WITH_APPROVAL، استلام 5 ثم استهلاك 10 بموافقة صريحة
    const inventoryRepo = new KyselyInventoryItemRepository(db);
    const negItem = InventoryItem.register({ name: "صنف-سالب-جست", unit: "كيلو", negativeStockPolicy: "ALLOW_WITH_APPROVAL" });
    await inventoryRepo.save(negItem);
    negativeStockItemId = negItem.id;
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: negativeStockItemId, branchId, movementType: "RECEIPT", quantityDelta: 5 });
    await request(app.getHttpServer())
      .post("/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ inventoryItemId: negativeStockItemId, branchId, movementType: "CONSUMPTION", quantityDelta: -10, approved: true });

    // 2) صنف من غير تكلفة وحدة، مستخدم في وصفة نشطة
    const missingCostItem = InventoryItem.register({ name: "صنف-بدون-تكلفة-جست", unit: "كيلو" });
    await inventoryRepo.save(missingCostItem);
    missingCostItemId = missingCostItem.id;
    const menuItemRepo = new KyselyMenuItemRepository(db);
    const menuItem = MenuItem.register({ name: "صنف-مركز-تنبيهات-جست" });
    const variant = menuItem.addVariant({ label: "عادي", price: 10 });
    await menuItemRepo.save(menuItem);
    const recipeRepo = new KyselyRecipeRepository(db);
    const recipe = Recipe.register({ recipeType: "sellable_variant", variantId: variant.id });
    const version = recipe.createDraftVersion({});
    recipe.addIngredient(version.id, { ingredientItemId: missingCostItemId, quantity: 1 });
    recipe.activateVersion(version.id);
    await recipeRepo.save(recipe);

    // 3) مصروف بمبلغ أعلى من حد التنبيه
    const categoryRes = await request(app.getHttpServer())
      .post("/expenses/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "صيانة-مركز-تنبيهات-جست", alertThreshold: 100 });
    await request(app.getHttpServer())
      .post("/expenses")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ branchId, businessDate: today, categoryId: categoryRes.body.id, amount: 150 });

    // 4) شكوى عميل فاضلة من زمان (backdated مباشرة في القاعدة - مفيش API لإنشاء شكوى مباشرة)
    const complaintRepo = new KyselyComplaintRepository(db);
    const complaint = Complaint.register({
      channel: "phone_followup", branchId, customerPhone: "01000000000", category: "late_order", status: "open",
    });
    await complaintRepo.save(complaint);
    complaintId = complaint.id;
    await sql`UPDATE complaints SET created_at = now() - interval '5 days' WHERE id = ${complaintId}`.execute(db);

    // 5) فاتورة مورد فات معاد استحقاقها ولسه من غير سداد
    const supplierRes = await request(app.getHttpServer())
      .post("/procurement/suppliers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "مورد-مركز-تنبيهات-جست" });
    const invoiceRes = await request(app.getHttpServer())
      .post("/procurement/supplier-invoices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        supplierId: supplierRes.body.id, branchId, supplierInvoiceNumber: "AC-INV-1",
        dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        lines: [{ inventoryItemId: negativeStockItemId, invoicedQuantity: 1, unitPrice: 200 }],
      });
    supplierInvoiceId = invoiceRes.body.id;
  });

  afterAll(async () => {
    const db = app.get(KYSELY);
    await sql`DELETE FROM supplier_invoice_lines WHERE supplier_invoice_id = ${supplierInvoiceId}`.execute(db);
    await sql`DELETE FROM supplier_invoices WHERE id = ${supplierInvoiceId}`.execute(db);
    await sql`DELETE FROM suppliers WHERE name = 'مورد-مركز-تنبيهات-جست'`.execute(db);
    await sql`DELETE FROM complaints WHERE id = ${complaintId}`.execute(db);
    await sql`DELETE FROM expenses WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM expense_categories WHERE name = 'صيانة-مركز-تنبيهات-جست'`.execute(db);
    await sql`DELETE FROM recipe_ingredients WHERE ingredient_item_id = ${missingCostItemId}`.execute(db);
    await sql`DELETE FROM recipe_versions WHERE id IN (SELECT rv.id FROM recipe_versions rv JOIN recipes r ON r.id = rv.recipe_id)`.execute(db);
    await sql`DELETE FROM recipes`.execute(db);
    await sql`DELETE FROM menu_item_variants WHERE label = 'عادي' AND item_id IN (SELECT id FROM menu_items WHERE name = 'صنف-مركز-تنبيهات-جست')`.execute(db);
    await sql`DELETE FROM menu_items WHERE name = 'صنف-مركز-تنبيهات-جست'`.execute(db);
    await sql`DELETE FROM stock_movements WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branch_stock_balances WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM inventory_items WHERE id IN (${negativeStockItemId}, ${missingCostItemId})`.execute(db);
    await sql`DELETE FROM treasuries WHERE branch_id = ${branchId}`.execute(db);
    await sql`DELETE FROM branches WHERE id = ${branchId}`.execute(db);
    await sql`DELETE FROM users WHERE email = 'admin-actioncenter@jest.test'`.execute(db);
    await app.close();
  });

  test("بيرجّع كل أنواع التنبيهات المتوقعة، مرتّبة HIGH ثم MEDIUM", async () => {
    const res = await request(app.getHttpServer())
      .get("/reports/action-center")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const types = res.body.alerts.map((a: { type: string }) => a.type);
    expect(types).toContain("NEGATIVE_STOCK");
    expect(types).toContain("ITEMS_MISSING_COST");
    expect(types).toContain("EXPENSE_OVER_THRESHOLD");
    expect(types).toContain("STALE_COMPLAINTS");
    expect(types).toContain("OVERDUE_SUPPLIER_INVOICES");

    const severities = res.body.alerts.map((a: { severity: string }) => a.severity);
    const firstMediumIndex = severities.indexOf("MEDIUM");
    const lastHighIndex = severities.lastIndexOf("HIGH");
    if (firstMediumIndex !== -1 && lastHighIndex !== -1) expect(lastHighIndex).toBeLessThan(firstMediumIndex);

    expect(res.body.countsBySeverity.HIGH).toBeGreaterThanOrEqual(2); // NEGATIVE_STOCK + ITEMS_MISSING_COST
    expect(res.body.countsBySeverity.MEDIUM).toBeGreaterThanOrEqual(3);

    const negativeStockAlert = res.body.alerts.find((a: { type: string }) => a.type === "NEGATIVE_STOCK");
    expect(negativeStockAlert.branchId).toBe(branchId);
  });

  test("فلتر فرع - بيستبعد تنبيه الصنف-من-غير-تكلفة (شركة-wide بس)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/action-center?branchId=${branchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const types = res.body.alerts.map((a: { type: string }) => a.type);
    expect(types).not.toContain("ITEMS_MISSING_COST");
    expect(types).toContain("NEGATIVE_STOCK");
  });

  test("من غير توكن -> 401", async () => {
    const res = await request(app.getHttpServer()).get("/reports/action-center");
    expect(res.status).toBe(401);
  });
});
