import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { DATABASE } from "../../../src/shared/database/database.module";
import type { Database } from "../../../src/shared/database/database.token";
import { and, eq, inArray, sql } from "drizzle-orm";
import { branches } from "../../../src/contexts/branches/infrastructure/persistence/branches.tables";
import { menuItemVariants, menuItems, recipeIngredients, recipeVersions, recipes } from "../../../src/contexts/catalog/infrastructure/persistence/catalog.tables";
import { complaints } from "../../../src/contexts/crm/infrastructure/persistence/crm.tables";
import { expenseCategories, expenses } from "../../../src/contexts/expenses/infrastructure/persistence/expenses.tables";
import { users } from "../../../src/contexts/identity-access/infrastructure/persistence/identity-access.tables";
import { branchStockBalances, inventoryItems, stockMovements } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { supplierInvoiceLines, supplierInvoices, suppliers } from "../../../src/contexts/procurement/infrastructure/persistence/procurement.tables";
import { treasuries } from "../../../src/contexts/treasury/infrastructure/persistence/treasury.tables";
import { businessDateString } from "../../../src/shared/time/business-date";

describe("Reporting - GET /reports/action-center (e2e ضد تطبيق حقيقي كامل)", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let negativeStockItemId: string;
  let missingCostItemId: string;
  let complaintId: string;
  let supplierInvoiceId: string;
  const today = businessDateString();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const { UserRepository } = await import(
      "../../../src/contexts/identity-access/infrastructure/persistence/user.repository"
    );
    const { User } = await import("../../../src/contexts/identity-access/domain/user.aggregate");
    const { BcryptPasswordHasher } = await import(
      "../../../src/contexts/identity-access/infrastructure/security/bcrypt-password-hasher"
    );
    const { InventoryItemRepository } = await import(
      "../../../src/contexts/inventory/infrastructure/persistence/inventory-item.repository"
    );
    const { InventoryItem } = await import("../../../src/contexts/inventory/domain/inventory-item.aggregate");
    const { MenuItemRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/menu-item.repository"
    );
    const { RecipeRepository } = await import(
      "../../../src/contexts/catalog/infrastructure/persistence/recipe.repository"
    );
    const { MenuItem } = await import("../../../src/contexts/catalog/domain/menu-item.aggregate");
    const { Recipe } = await import("../../../src/contexts/catalog/domain/recipe.aggregate");
    const { ComplaintRepository } = await import(
      "../../../src/contexts/crm/infrastructure/persistence/complaint.repository"
    );
    const { Complaint } = await import("../../../src/contexts/crm/domain/complaint.aggregate");

    const userRepo = new UserRepository(app.get<Database>(DATABASE));
    const hasher = new BcryptPasswordHasher();
    const admin = User.register({
      name: "أدمن-مركز-تنبيهات-جست", email: "admin-actioncenter@jest.test", passwordHash: await hasher.hash("12345678"), roles: ["admin"],
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
    const inventoryRepo = new InventoryItemRepository(app.get<Database>(DATABASE));
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
    const menuItemRepo = new MenuItemRepository(app.get<Database>(DATABASE));
    const menuItem = MenuItem.register({ name: "صنف-مركز-تنبيهات-جست" });
    const variant = menuItem.addVariant({ label: "عادي", price: 10 });
    await menuItemRepo.save(menuItem);
    const recipeRepo = new RecipeRepository(app.get<Database>(DATABASE));
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
    const complaintRepo = new ComplaintRepository(app.get<Database>(DATABASE));
    const complaint = Complaint.register({
      channel: "phone_followup", branchId, customerPhone: "01000000000", category: "late_order", status: "open",
    });
    await complaintRepo.save(complaint);
    complaintId = complaint.id;
    await app.get<Database>(DATABASE).update(complaints).set({ created_at: sql`now() - interval '5 days'` }).where(eq(complaints.id, complaintId));

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
    const database = app.get<Database>(DATABASE);
    await database.delete(supplierInvoiceLines).where(eq(supplierInvoiceLines.supplier_invoice_id, supplierInvoiceId));
    await database.delete(supplierInvoices).where(eq(supplierInvoices.id, supplierInvoiceId));
    await database.delete(suppliers).where(eq(suppliers.name, "مورد-مركز-تنبيهات-جست"));
    await database.delete(complaints).where(eq(complaints.id, complaintId));
    await database.delete(expenses).where(eq(expenses.branch_id, branchId));
    await database.delete(expenseCategories).where(eq(expenseCategories.name, "صيانة-مركز-تنبيهات-جست"));
    await database.delete(recipeIngredients).where(eq(recipeIngredients.ingredient_item_id, missingCostItemId));
    await database.delete(recipeVersions).where(inArray(recipeVersions.id, database.select({ id: recipeVersions.id }).from(recipeVersions).innerJoin(recipes, eq(recipes.id, recipeVersions.recipe_id))));
    await database.delete(recipes);
    await database.delete(menuItemVariants).where(and(eq(menuItemVariants.label, "عادي"), inArray(menuItemVariants.item_id, database.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.name, "صنف-مركز-تنبيهات-جست")))));
    await database.delete(menuItems).where(eq(menuItems.name, "صنف-مركز-تنبيهات-جست"));
    await database.delete(stockMovements).where(eq(stockMovements.branch_id, branchId));
    await database.delete(branchStockBalances).where(eq(branchStockBalances.branch_id, branchId));
    await database.delete(inventoryItems).where(inArray(inventoryItems.id, [negativeStockItemId, missingCostItemId]));
    await database.delete(treasuries).where(eq(treasuries.branch_id, branchId));
    await database.delete(branches).where(eq(branches.id, branchId));
    await database.delete(users).where(eq(users.email, "admin-actioncenter@jest.test"));
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

  test("paginate=1 pages the alerts in severity order and keeps the counts over every alert", async () => {
    const full = await request(app.getHttpServer())
      .get("/reports/action-center")
      .set("Authorization", `Bearer ${adminToken}`);
    const firstPage = await request(app.getHttpServer())
      .get("/reports/action-center?paginate=1&limit=2&offset=0")
      .set("Authorization", `Bearer ${adminToken}`);
    const secondPage = await request(app.getHttpServer())
      .get("/reports/action-center?paginate=1&limit=2&offset=2")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toMatchObject({ total: full.body.alerts.length, limit: 2, offset: 0 });
    expect(firstPage.body.alerts).toEqual(full.body.alerts.slice(0, 2));
    expect(secondPage.body.alerts).toEqual(full.body.alerts.slice(2, 4));
    expect(firstPage.body.countsBySeverity).toEqual(full.body.countsBySeverity);
    expect(full.body.total).toBeUndefined();
  });

  test("من غير توكن -> 401", async () => {
    const res = await request(app.getHttpServer()).get("/reports/action-center");
    expect(res.status).toBe(401);
  });
});
