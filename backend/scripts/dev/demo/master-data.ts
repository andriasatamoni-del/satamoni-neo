import { and, eq } from "drizzle-orm";
import { treasuries } from "../../../src/contexts/treasury/infrastructure/persistence/treasury.tables";
import { UpdatePosSettingsHandler } from "../../../src/contexts/settings/application/commands/update-pos-settings.handler";
import { RegisterAccountHandler } from "../../../src/contexts/accounting/application/commands/register-account.handler";
import { RegisterBranchHandler } from "../../../src/contexts/branches/application/commands/register-branch.handler";
import { UpdateBranchHandler } from "../../../src/contexts/branches/application/commands/update-branch.handler";
import { RegisterBankHandler } from "../../../src/contexts/treasury/application/commands/register-bank.handler";
import { RegisterBankAccountHandler } from "../../../src/contexts/treasury/application/commands/register-bank-account.handler";
import { RegisterUserHandler } from "../../../src/contexts/identity-access/application/commands/register-user.handler";
import { RegisterDepartmentHandler } from "../../../src/contexts/hr-payroll/application/commands/register-department.handler";
import { RegisterPositionHandler } from "../../../src/contexts/hr-payroll/application/commands/register-position.handler";
import { RegisterEmployeeHandler } from "../../../src/contexts/hr-payroll/application/commands/register-employee.handler";
import { RegisterPaymentMethodHandler } from "../../../src/contexts/payment-control/application/commands/register-payment-method.handler";
import { LinkTalabatPaymentCodeHandler } from "../../../src/contexts/payment-control/application/commands/link-talabat-payment-code.handler";
import { RegisterInventoryItemHandler } from "../../../src/contexts/inventory/application/commands/register-inventory-item.handler";
import { UpdateStockThresholdHandler } from "../../../src/contexts/inventory/application/commands/update-stock-threshold.handler";
import { RecordStockMovementHandler } from "../../../src/contexts/inventory/application/commands/record-stock-movement.handler";
import { RegisterSupplierHandler } from "../../../src/contexts/procurement/application/commands/register-supplier.handler";
import { RegisterPrinterHandler } from "../../../src/contexts/printing/application/commands/register-printer.handler";
import { RegisterKitchenStationHandler } from "../../../src/contexts/printing/application/commands/register-kitchen-station.handler";
import { RouteMenuCategoryHandler } from "../../../src/contexts/printing/application/commands/route-menu-category.handler";
import { UploadImageHandler } from "../../../src/contexts/media/application/upload-image.handler";
import { RegisterMenuCategoryHandler } from "../../../src/contexts/catalog/application/commands/register-menu-category.handler";
import { RegisterMenuItemHandler } from "../../../src/contexts/catalog/application/commands/register-menu-item.handler";
import { AddModifierHandler } from "../../../src/contexts/catalog/application/commands/add-modifier.handler";
import { SetModifierVariantPriceHandler } from "../../../src/contexts/catalog/application/commands/set-modifier-variant-price.handler";
import { RegisterRecipeHandler } from "../../../src/contexts/catalog/application/commands/register-recipe.handler";
import { CreateRecipeVersionHandler } from "../../../src/contexts/catalog/application/commands/create-recipe-version.handler";
import { ActivateRecipeVersionHandler } from "../../../src/contexts/catalog/application/commands/activate-recipe-version.handler";
import { RegisterComboHandler } from "../../../src/contexts/catalog/application/commands/register-combo.handler";
import { ReorderMenuCategoriesHandler } from "../../../src/contexts/catalog/application/commands/reorder-menu-categories.handler";
import { RegisterDriverHandler } from "../../../src/contexts/delivery/application/commands/register-driver.handler";
import { RegisterCustomerHandler } from "../../../src/contexts/customers/application/commands/register-customer.handler";
import { RegisterExpenseCategoryHandler } from "../../../src/contexts/expenses/application/commands/register-expense-category.handler";
import { SaveLoyaltyRewardHandler } from "../../../src/contexts/loyalty/application/commands/save-loyalty-reward.handler";
import { UpsertProductMappingHandler } from "../../../src/contexts/talabat/application/commands/upsert-product-mapping.handler";
import { RegisterJournalEntryHandler } from "../../../src/contexts/accounting/application/commands/register-journal-entry.handler";
import { PostJournalEntryHandler } from "../../../src/contexts/accounting/application/commands/post-journal-entry.handler";
import { AuditLogService } from "../../../src/shared/audit/audit-log.service";
import {
  AREAS,
  BRANCHES,
  CHART_OF_ACCOUNTS,
  COMBOS,
  DEMO_LOGIN_SECRET,
  DEPARTMENTS,
  DRIVERS,
  EXPENSE_CATEGORIES,
  INVENTORY,
  MANUFACTURED_RECIPES,
  MENU,
  PAYMENT_METHODS,
  POSITIONS,
  RETAIL_BRANCH_KEYS,
  STAFF,
  SUPPLIERS,
  egyptianMobile,
  egyptianName,
} from "./demo-data";
import { placeholderPng } from "./png";
import { between, count, handler, pick, round2, type SeedContext } from "./seed-context";

const KITCHEN_STATIONS = [
  { key: "pizza", name: "فرن البيتزا", printer: "طابعة فرن البيتزا" },
  { key: "feteer", name: "ركن الفطير", printer: "طابعة ركن الفطير" },
  { key: "grill", name: "الجريل والمكرونات", printer: "طابعة الجريل" },
  { key: "bar", name: "البار والمشروبات", printer: "طابعة البار" },
];

export async function seedMasterData(ctx: SeedContext): Promise<void> {
  await seedSettings(ctx);
  await seedChartOfAccounts(ctx);
  await seedBranches(ctx);
  await seedBank(ctx);
  await seedUsers(ctx);
  await seedHr(ctx);
  await seedPaymentMethods(ctx);
  await seedInventoryItems(ctx);
  await seedSuppliers(ctx);
  const stations = await seedPrinting(ctx);
  await seedCatalog(ctx, stations);
  await seedManufacturedRecipes(ctx);
  await seedDrivers(ctx);
  await seedCustomers(ctx);
  await seedExpenseCategories(ctx);
  await seedLoyaltyRewards(ctx);
  await seedTalabatMappings(ctx);
  await seedOpeningBalances(ctx);
}

async function seedSettings(ctx: SeedContext) {
  await handler(ctx, UpdatePosSettingsHandler).execute({
    updatedBy: null,
    shiftVarianceAckThresholdEgp: 20,
    driverSettlementVarianceAckThresholdEgp: 30,
    driverHourlyRateEgp: 35,
    paymentAdjustmentHighThresholdEgp: 500,
    productionVarianceAlertPercent: 5,
    whatsappBotEnabled: false,
    smsConfirmationsEnabled: true,
    smsRatingRequestsEnabled: true,
    onlineOrderingEnabled: true,
    loyaltyPointsPerEgp: 0.1,
  });
}

async function seedChartOfAccounts(ctx: SeedContext) {
  const register = handler(ctx, RegisterAccountHandler);
  for (const spec of CHART_OF_ACCOUNTS) {
    const account = await register.execute({
      code: spec.code,
      name: spec.name,
      accountType: spec.type,
      parentAccountId: spec.parent ? ctx.accounts[spec.parent] : null,
      isSystemAccount: spec.system ?? false,
    });
    ctx.accounts[spec.code] = account.id;
    count(ctx, "accounts");
  }
}

async function seedBranches(ctx: SeedContext) {
  const register = handler(ctx, RegisterBranchHandler);
  const update = handler(ctx, UpdateBranchHandler);
  for (const spec of BRANCHES) {
    const branch = await register.execute({
      name: spec.name,
      address: spec.address,
      phone: spec.phone,
      hours: spec.hours,
      lat: spec.lat,
      lng: spec.lng,
      isCentralKitchen: spec.isCentralKitchen ?? false,
      supportsDineIn: spec.supportsDineIn ?? true,
    });
    ctx.branches[spec.key] = branch.id;
    if (spec.talabatBranchId) await update.execute({ branchId: branch.id, talabatBranchId: spec.talabatBranchId });
    const [main] = await ctx.db
      .select({ id: treasuries.id })
      .from(treasuries)
      .where(and(eq(treasuries.branch_id, branch.id), eq(treasuries.kind, "MAIN")));
    ctx.treasuries[spec.key] = main.id;
    count(ctx, "branches");
  }
}

async function seedBank(ctx: SeedContext) {
  const nbe = await handler(ctx, RegisterBankHandler).execute({ name: "البنك الأهلي المصري" });
  const cib = await handler(ctx, RegisterBankHandler).execute({ name: "البنك التجاري الدولي CIB" });
  const registerAccount = handler(ctx, RegisterBankAccountHandler);
  const main = await registerAccount.execute({
    bankId: nbe.id,
    name: "الحساب الجاري الرئيسي",
    accountNumber: "1903070012456801",
    iban: "EG380003019030700124568010010",
    bankBranchName: "فرع مدينة نصر - مكرم عبيد",
    notes: "حساب التحصيلات والإيداعات اليومية",
  });
  const salary = await registerAccount.execute({
    bankId: cib.id,
    name: "حساب الرواتب",
    accountNumber: "100045672219",
    iban: "EG800010010000000100045672219",
    bankBranchName: "فرع الكوربة",
    notes: "مخصص لتحويل المرتبات الشهرية",
  });
  ctx.bankTreasuryId = main.treasuryId;
  ctx.treasuries.salary = salary.treasuryId;
}

async function seedUsers(ctx: SeedContext) {
  const register = handler(ctx, RegisterUserHandler);
  for (const staff of STAFF) {
    const user = await register.execute({
      name: staff.name,
      email: staff.email,
      password: DEMO_LOGIN_SECRET,
      roles: staff.roles,
      branchId: staff.branchKey ? ctx.branches[staff.branchKey] : null,
    });
    ctx.users[staff.key] = user.id;
    count(ctx, "users");
  }
}

async function seedHr(ctx: SeedContext) {
  const departments: Record<string, string> = {};
  for (const d of DEPARTMENTS) departments[d.code] = (await handler(ctx, RegisterDepartmentHandler).execute(d)).id;
  for (const p of POSITIONS) {
    positions[p.code] = (await handler(ctx, RegisterPositionHandler).execute({ code: p.code, name: p.name, departmentId: departments[p.department] })).id;
  }
  const register = handler(ctx, RegisterEmployeeHandler);
  let sequence = 1001;
  for (const staff of STAFF) {
    const employee = await register.execute({
      name: staff.name,
      userId: ctx.users[staff.key],
      departmentId: departments[staff.department],
      positionId: positions[staff.position],
      hireDate: new Date(`${staff.hireDate}T00:00:00Z`),
      baseSalary: staff.baseSalary,
      wageType: "fixed_monthly",
      workingDaysPerMonth: 26,
      shift: staff.shift ?? "9 ص - 5 م",
      restrictedBranchId: staff.branchKey ? ctx.branches[staff.branchKey] : null,
      employeeCode: `EMP-${sequence++}`,
      phone: staff.phone,
    });
    ctx.employees[staff.key] = employee.id;
    count(ctx, "employees");
  }
  for (const [i, driver] of DRIVERS.entries()) {
    const employee = await register.execute({
      name: driver.name,
      departmentId: departments.DELIVERY,
      positionId: positions.DRIVER,
      hireDate: new Date(Date.UTC(2023, i, 1)),
      baseSalary: 0,
      wageType: "hourly",
      hourlyRate: 35,
      shift: "4 م - 12 ص",
      restrictedBranchId: ctx.branches[driver.branchKey],
      employeeCode: `DRV-${200 + i}`,
      phone: driver.phone,
      notes: "يتحاسب بالساعة + 5 جنيه عن كل أوردر متسلّم",
    });
    ctx.employees[`driver${i}`] = employee.id;
    count(ctx, "employees");
  }
}

async function seedPaymentMethods(ctx: SeedContext) {
  for (const spec of PAYMENT_METHODS) {
    const method = await handler(ctx, RegisterPaymentMethodHandler).execute({
      name: spec.name,
      kind: spec.kind,
      settlementChannel: "settlementChannel" in spec ? spec.settlementChannel : null,
    });
    if ("talabatPaymentCode" in spec) {
      await handler(ctx, LinkTalabatPaymentCodeHandler).execute({ paymentMethodId: method.id, talabatPaymentCode: spec.talabatPaymentCode });
    }
    ctx.paymentMethods[spec.key] = { id: method.id, kind: spec.kind };
  }
}

async function seedInventoryItems(ctx: SeedContext) {
  const register = handler(ctx, RegisterInventoryItemHandler);
  for (const spec of INVENTORY) {
    const item = await register.execute({ name: spec.name, unit: spec.unit, unitCost: spec.unitCost, itemType: spec.itemType ?? "raw", negativeStockPolicy: "STRICT" });
    ctx.inventory[spec.key] = item.id;
    count(ctx, "inventoryItems");
  }
  const thresholds = handler(ctx, UpdateStockThresholdHandler);
  for (const branch of BRANCHES) {
    for (const spec of INVENTORY) {
      const central = branch.key === "central";
      const opening = central ? spec.centralOpening : spec.branchOpening;
      if (opening <= 0) continue;
      const reorderPoint = central ? Math.round(opening * 0.25) : spec.reorderPoint;
      await thresholds.execute({
        branchId: ctx.branches[branch.key],
        inventoryItemId: ctx.inventory[spec.key],
        reorderPoint,
        minStock: Math.round(reorderPoint * 0.5),
        maxStock: Math.round(opening * 1.5),
        updatedBy: ctx.users.opsAdmin,
      });
    }
  }
}

async function seedSuppliers(ctx: SeedContext) {
  for (const spec of SUPPLIERS) {
    const supplier = await handler(ctx, RegisterSupplierHandler).execute({
      name: spec.name,
      contactPerson: spec.contactPerson,
      phone: spec.phone,
      email: spec.email,
      address: spec.address,
      paymentTerms: spec.paymentTerms,
    });
    ctx.suppliers[spec.key] = supplier.id;
  }
}

async function seedPrinting(ctx: SeedContext): Promise<Record<string, string>> {
  const routedStations: Record<string, string> = {};
  for (const branch of BRANCHES) {
    const branchId = ctx.branches[branch.key];
    await handler(ctx, RegisterPrinterHandler).execute({
      branchId,
      name: "طابعة الكاشير",
      printerType: "CASHIER",
      connectionType: "USB",
      osPrinterName: "XP-80C",
      paperWidthMm: 80,
    });
    await handler(ctx, RegisterPrinterHandler).execute({
      branchId,
      name: "طابعة التقارير",
      printerType: "REPORT",
      connectionType: "LAN",
      ipAddress: `${branch.lanSubnet}.60`,
      port: 9100,
      paperWidthMm: 80,
    });
    if (branch.isCentralKitchen) continue;
    await handler(ctx, RegisterPrinterHandler).execute({
      branchId,
      name: "طابعة التوصيل",
      printerType: "DELIVERY",
      connectionType: "LAN",
      ipAddress: `${branch.lanSubnet}.55`,
      port: 9100,
      paperWidthMm: 80,
    });
    for (const [i, station] of KITCHEN_STATIONS.entries()) {
      const printer = await handler(ctx, RegisterPrinterHandler).execute({
        branchId,
        name: station.printer,
        printerType: "KITCHEN",
        connectionType: "LAN",
        ipAddress: `${branch.lanSubnet}.${51 + i}`,
        port: 9100,
        paperWidthMm: 80,
      });
      const kitchenStation = await handler(ctx, RegisterKitchenStationHandler).execute({ branchId, name: station.name, printerId: printer.id });
      if (branch.key === "nasr") routedStations[station.key] = kitchenStation.id;
    }
  }
  return routedStations;
}

async function seedCatalog(ctx: SeedContext, stations: Record<string, string>) {
  const upload = handler(ctx, UploadImageHandler);
  const order: string[] = [];
  for (const [categoryIndex, category] of MENU.entries()) {
    const registeredCategory = await handler(ctx, RegisterMenuCategoryHandler).execute({
      name: category.name,
      displayOrder: categoryIndex + 1,
      menuGroup: category.menuGroup ?? "regular",
    });
    order.push(registeredCategory.id);
    if (categoryIndex === 1) order.push("combos");
    await handler(ctx, RouteMenuCategoryHandler).execute({ categoryId: registeredCategory.id, stationId: stations[category.station] ?? null });

    for (const [itemIndex, spec] of category.items.entries()) {
      const shade = 0.75 + (itemIndex % 3) * 0.12;
      const image = await upload.execute({
        content: placeholderPng(category.color.map((c) => Math.min(255, Math.round(c * shade))) as [number, number, number]),
        uploadedBy: ctx.users.opsAdmin,
      });
      count(ctx, "images");
      const item = await handler(ctx, RegisterMenuItemHandler).execute({
        categoryId: registeredCategory.id,
        name: spec.name,
        description: spec.description,
        imageUrl: image.url,
        isBest: spec.isBest ?? false,
        variants: spec.variants.map((v) => ({ label: v.label, price: v.price, talabatPrice: v.talabatPrice })),
      });
      const ref = {
        id: item.id,
        categoryKey: category.key,
        popularity: spec.popularity,
        variants: item.variants.map((v) => ({ id: v.id, label: v.label })),
        modifiers: [] as { id: string; name: string }[],
      };
      for (const v of ref.variants) ctx.variants[`${spec.key}:${v.label}`] = v.id;

      for (const modifierSpec of spec.modifiers ?? []) {
        const { modifier } = await handler(ctx, AddModifierHandler).execute({ itemId: item.id, name: modifierSpec.name, priceDelta: modifierSpec.priceDelta });
        ref.modifiers.push({ id: modifier.id, name: modifier.name });
        if (!modifierSpec.perVariant) continue;
        for (const [i, v] of ref.variants.entries()) {
          await handler(ctx, SetModifierVariantPriceHandler).execute({
            itemId: item.id,
            modifierId: modifier.id,
            variantId: v.id,
            priceDelta: modifierSpec.perVariant[i],
            changedBy: ctx.users.opsAdmin,
          });
        }
      }
      ctx.menuItems[spec.key] = ref;
      count(ctx, "menuItems");

      for (const variantSpec of spec.variants) {
        const variantId = ctx.variants[`${spec.key}:${variantSpec.label}`];
        await registerActiveRecipe(ctx, { recipeType: "sellable_variant", variantId }, variantSpec.recipe);
      }
    }
  }

  for (const combo of COMBOS) {
    const registered = await handler(ctx, RegisterComboHandler).execute({
      name: combo.name,
      description: combo.description,
      price: combo.price,
      onlineOnly: combo.onlineOnly ?? false,
      items: combo.items.map(([itemKey, label, quantity]) => ({ variantId: ctx.variants[`${itemKey}:${label}`], quantity })),
    });
    ctx.combos[combo.name] = registered.id;
  }
  await handler(ctx, ReorderMenuCategoriesHandler).execute({ order });
}

async function registerActiveRecipe(
  ctx: SeedContext,
  association: { recipeType: "sellable_variant" | "manufactured_item"; variantId?: string; inventoryItemId?: string },
  ingredients: Record<string, number>
) {
  const recipe = await handler(ctx, RegisterRecipeHandler).execute(association);
  const { version } = await handler(ctx, CreateRecipeVersionHandler).execute({
    recipeId: recipe.id,
    createdBy: ctx.users.centralManager,
    ingredients: Object.entries(ingredients).map(([key, quantity]) => ({
      ingredientItemId: ctx.inventory[key],
      quantity,
      unit: INVENTORY.find((i) => i.key === key)!.unit,
    })),
  });
  await handler(ctx, ActivateRecipeVersionHandler).execute({ recipeId: recipe.id, versionId: version.id });
  count(ctx, "recipes");
  return recipe.id;
}

export const positionIds: Record<string, string> = {};
const positions = positionIds;
export const manufacturedRecipeIds: Record<string, string> = {};

async function seedManufacturedRecipes(ctx: SeedContext) {
  for (const [key, lines] of Object.entries(MANUFACTURED_RECIPES)) {
    manufacturedRecipeIds[key] = await registerActiveRecipe(
      ctx,
      { recipeType: "manufactured_item", inventoryItemId: ctx.inventory[key] },
      Object.fromEntries(lines.map((l) => [l.ingredient, l.quantity]))
    );
  }
}

async function seedDrivers(ctx: SeedContext) {
  for (const spec of DRIVERS) {
    const driver = await handler(ctx, RegisterDriverHandler).execute({ name: spec.name, phone: spec.phone, branchId: ctx.branches[spec.branchKey] });
    (ctx.drivers[spec.branchKey] ??= []).push(driver.id);
  }
}

async function seedCustomers(ctx: SeedContext) {
  const register = handler(ctx, RegisterCustomerHandler);
  const usedPhones = new Set<string>();
  const freshPhone = () => {
    let phone = egyptianMobile(ctx.rand);
    while (usedPhones.has(phone)) phone = egyptianMobile(ctx.rand);
    usedPhones.add(phone);
    return phone;
  };
  for (let i = 0; i < 48; i++) {
    const branchKey = RETAIL_BRANCH_KEYS[i % RETAIL_BRANCH_KEYS.length];
    const zone = pick(ctx.rand, AREAS[branchKey]);
    const name = egyptianName(ctx.rand);
    const phone = freshPhone();
    const street = pick(ctx.rand, zone.streets);
    const building = String(between(ctx.rand, 1, 120));
    const floor = String(between(ctx.rand, 1, 12));
    const apartment = String(between(ctx.rand, 1, 30));
    const { customer } = await register.execute({
      phone,
      phone2: freshPhone(),
      email: `customer${String(i + 1).padStart(3, "0")}@mail.satamoni-demo.example`,
      name,
      password: DEMO_LOGIN_SECRET,
      address: { label: i % 4 === 0 ? "الشغل" : "البيت", area: zone.area, street, building, floor, apartment, distinguishingMark: i % 3 === 0 ? "جنب الصيدلية" : null, isDefault: true },
    });
    const address = customer.addresses[0];
    ctx.customers.push({
      customer,
      phone,
      name,
      branchKey,
      addressId: address.id,
      addressText: `${zone.area}، ${street}، عمارة ${building}، الدور ${floor}، شقة ${apartment}`,
    });
    count(ctx, "customers");
  }
}

async function seedExpenseCategories(ctx: SeedContext) {
  for (const spec of EXPENSE_CATEGORIES) {
    const category = await handler(ctx, RegisterExpenseCategoryHandler).execute({ name: spec.name, accountId: ctx.accounts[spec.account], alertThreshold: spec.alertThreshold });
    ctx.expenseCategories[spec.key] = category.id;
  }
}

async function seedLoyaltyRewards(ctx: SeedContext) {
  const save = handler(ctx, SaveLoyaltyRewardHandler);
  const rewards = [
    { name: "خصم 50 جنيه", description: "على أي أوردر من الموقع", pointsCost: 250, kind: "discount", discountAmount: 50 },
    { name: "خصم 120 جنيه", description: "على أي أوردر من الموقع", pointsCost: 550, kind: "discount", discountAmount: 120 },
    { name: "بيبسي مجانًا", description: "كانز مع أي أوردر", pointsCost: 90, kind: "free_item", variantId: ctx.variants["pepsi:كانز"] },
    { name: "فطير نوتيلا صغير مجانًا", description: "هدية لعملاء ساتاموني", pointsCost: 400, kind: "free_item", variantId: ctx.variants["feteerNutella:صغير"] },
    { name: "وجبة تشيز برجر مجانًا", description: "بالنقاط", pointsCost: 520, kind: "free_combo", comboId: ctx.combos["وجبة تشيز برجر"] },
  ];
  for (const reward of rewards) {
    const view = await save.create({ ...reward, isActive: true });
    ctx.rewards.push(view.id);
  }
}

async function seedTalabatMappings(ctx: SeedContext) {
  const upsert = handler(ctx, UpsertProductMappingHandler);
  for (const branchKey of RETAIL_BRANCH_KEYS) {
    for (const [itemKey, ref] of Object.entries(ctx.menuItems)) {
      for (const variant of ref.variants) {
        await upsert.execute({ branchId: ctx.branches[branchKey], talabatItemId: talabatItemId(itemKey, variant.label), menuItemId: ref.id, variantId: variant.id });
      }
    }
  }
}

export function talabatItemId(itemKey: string, label: string): string {
  const sizes: Record<string, string> = { صغير: "S", وسط: "M", كبير: "L", سينجل: "1", دبل: "2" };
  return `TLB-${itemKey.toUpperCase()}-${sizes[label] ?? "U"}`;
}

async function seedOpeningBalances(ctx: SeedContext) {
  const record = handler(ctx, RecordStockMovementHandler);
  let inventoryValue = 0;
  for (const branch of BRANCHES) {
    for (const spec of INVENTORY) {
      const quantity = branch.key === "central" ? spec.centralOpening : spec.branchOpening;
      if (quantity <= 0) continue;
      await record.execute({
        inventoryItemId: ctx.inventory[spec.key],
        branchId: ctx.branches[branch.key],
        movementType: "OPENING_BALANCE",
        quantityDelta: quantity,
        reason: "رصيد افتتاحي عند بدء التشغيل على النظام",
        referenceType: "opening_balance",
        performedBy: ctx.users.centralStore,
      });
      inventoryValue += quantity * spec.unitCost;
      count(ctx, "openingStockLines");
    }
  }

  const treasuryRows = await ctx.db.select({ id: treasuries.id, account_id: treasuries.account_id, branch_id: treasuries.branch_id }).from(treasuries);
  const branchCash = treasuryRows.filter((t) => t.branch_id);
  const bank = treasuryRows.find((t) => t.id === ctx.bankTreasuryId)!;
  for (const t of treasuryRows) ctx.accounts[`treasury:${t.id}`] = t.account_id;
  const lines = [
    { accountId: ctx.accounts["1400"], debit: round2(inventoryValue), credit: 0, description: "مخزون أول المدة بكل الفروع" },
    ...branchCash.map((t) => ({ accountId: t.account_id, debit: 5000, credit: 0, description: "عهدة نقدية افتتاحية للفرع" })),
    { accountId: bank.account_id, debit: 850000, credit: 0, description: "رصيد البنك الافتتاحي" },
    { accountId: ctx.accounts["1510"], debit: 1850000, credit: 0, description: "أفران ومعدات المطابخ" },
    { accountId: ctx.accounts["1520"], debit: 640000, credit: 0, description: "أثاث وديكورات الفروع" },
    { accountId: ctx.accounts["1530"], debit: 390000, credit: 0, description: "6 موتوسيكلات توصيل" },
  ];
  const totalDebit = round2(lines.reduce((sum, l) => sum + l.debit, 0));
  const entry = await handler(ctx, RegisterJournalEntryHandler).execute({
    description: "قيد الافتتاح - أرصدة بداية التشغيل على ساتاموني نيو",
    sourceType: "manual",
    lines: [...lines, { accountId: ctx.accounts["3100"], debit: 0, credit: totalDebit, description: "رأس المال المدفوع" }],
    createdBy: ctx.users.chiefAccountant,
  });
  await handler(ctx, PostJournalEntryHandler).execute({ entryId: entry.id, postedBy: ctx.users.owner });
  await handler(ctx, AuditLogService).record({
    actorUserId: ctx.users.owner,
    action: "POST /accounting/journal-entries/:id/post",
    entityType: "journal_entry",
    entityId: entry.id,
    metadata: { description: "قيد الافتتاح" },
  });
}
