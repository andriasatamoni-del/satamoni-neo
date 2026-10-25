import { and, eq } from "drizzle-orm";
import { branchStockBalances, inventoryBatches } from "../../../src/contexts/inventory/infrastructure/persistence/inventory.tables";
import { RegisterPurchaseRequestHandler } from "../../../src/contexts/procurement/application/commands/register-purchase-request.handler";
import { SubmitPurchaseRequestHandler } from "../../../src/contexts/procurement/application/commands/submit-purchase-request.handler";
import { ApprovePurchaseRequestHandler } from "../../../src/contexts/procurement/application/commands/approve-purchase-request.handler";
import { RegisterPurchaseOrderHandler } from "../../../src/contexts/procurement/application/commands/register-purchase-order.handler";
import { SendPurchaseOrderHandler } from "../../../src/contexts/procurement/application/commands/send-purchase-order.handler";
import { RegisterGoodsReceiptHandler } from "../../../src/contexts/procurement/application/commands/register-goods-receipt.handler";
import { ConfirmGoodsReceiptHandler } from "../../../src/contexts/procurement/application/commands/confirm-goods-receipt.handler";
import { RegisterSupplierInvoiceHandler } from "../../../src/contexts/procurement/application/commands/register-supplier-invoice.handler";
import { ApproveSupplierInvoiceHandler } from "../../../src/contexts/procurement/application/commands/approve-supplier-invoice.handler";
import { RegisterSupplierPaymentHandler } from "../../../src/contexts/procurement/application/commands/register-supplier-payment.handler";
import { RegisterPurchaseReturnHandler } from "../../../src/contexts/procurement/application/commands/register-purchase-return.handler";
import { PostPurchaseReturnHandler } from "../../../src/contexts/procurement/application/commands/post-purchase-return.handler";
import { RegisterConversionOrderHandler } from "../../../src/contexts/production/application/commands/register-conversion-order.handler";
import { ApproveConversionOrderHandler } from "../../../src/contexts/production/application/commands/approve-conversion-order.handler";
import { StartConversionOrderHandler } from "../../../src/contexts/production/application/commands/start-conversion-order.handler";
import { CompleteConversionOrderHandler } from "../../../src/contexts/production/application/commands/complete-conversion-order.handler";
import { RegisterTransferRequestHandler } from "../../../src/contexts/inventory/application/commands/register-transfer-request.handler";
import { ApproveTransferRequestHandler } from "../../../src/contexts/inventory/application/commands/approve-transfer-request.handler";
import { DispatchTransferRequestHandler } from "../../../src/contexts/inventory/application/commands/dispatch-transfer-request.handler";
import { ReceiveTransferRequestHandler } from "../../../src/contexts/inventory/application/commands/receive-transfer-request.handler";
import { RegisterStocktakeHandler } from "../../../src/contexts/inventory/application/commands/register-stocktake.handler";
import { WriteOffInventoryBatchHandler } from "../../../src/contexts/inventory/application/commands/write-off-inventory-batch.handler";
import { RegisterExpenseHandler } from "../../../src/contexts/expenses/application/commands/register-expense.handler";
import { SubmitExpenseHandler } from "../../../src/contexts/expenses/application/commands/submit-expense.handler";
import { ReviewExpenseHandler } from "../../../src/contexts/expenses/application/commands/review-expense.handler";
import { TransferBetweenTreasuriesHandler } from "../../../src/contexts/treasury/application/commands/transfer-between-treasuries.handler";
import { RegisterJournalEntryHandler } from "../../../src/contexts/accounting/application/commands/register-journal-entry.handler";
import { PostJournalEntryHandler } from "../../../src/contexts/accounting/application/commands/post-journal-entry.handler";
import { ClosePeriodHandler } from "../../../src/contexts/accounting/application/commands/close-period.handler";
import { RegisterPayrollAdjustmentHandler } from "../../../src/contexts/hr-payroll/application/commands/register-payroll-adjustment.handler";
import { RegisterPayrollRunHandler } from "../../../src/contexts/hr-payroll/application/commands/register-payroll-run.handler";
import { ApprovePayrollRunHandler } from "../../../src/contexts/hr-payroll/application/commands/approve-payroll-run.handler";
import { RegisterLeaveRequestHandler } from "../../../src/contexts/hr-payroll/application/commands/register-leave-request.handler";
import { ReviewLeaveRequestHandler } from "../../../src/contexts/hr-payroll/application/commands/review-leave-request.handler";
import { UpdateEmployeeHandler } from "../../../src/contexts/hr-payroll/application/commands/update-employee.handler";
import { RegisterReconciliationRecordHandler } from "../../../src/contexts/payment-control/application/commands/register-reconciliation-record.handler";
import { AutoMatchReconciliationRecordsHandler } from "../../../src/contexts/payment-control/application/commands/auto-match-reconciliation-records.handler";
import { UpdateVariantHandler } from "../../../src/contexts/catalog/application/commands/update-variant.handler";
import { BRANCHES, DRIVERS, INVENTORY, MENU, MONTHLY_RENT, RETAIL_BRANCH_KEYS, STAFF } from "./demo-data";
import { manufacturedRecipeIds, positionIds } from "./master-data";
import { addDays, cairoTime } from "./clock";
import { audit, reportFailure, weeklyCardSales } from "./daily-operations";
import { between, count, handler, pick, round2, type SeedContext } from "./seed-context";

interface Payable {
  supplierId: string;
  branchId: string;
  invoiceId: string;
  amount: number;
  dueDay: string;
  fromBank: boolean;
}

const payables: Payable[] = [];
let invoiceSequence = 4100;
let goodsReceiptsSeen = 0;

const PAYMENT_TERM_DAYS: Record<string, number> = { mill: 30, dairy: 15, meat: 0, poultry: 7, veg: 0, drinks: 21, packaging: 45 };

function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

function dayOfMonth(day: string): number {
  return Number(day.slice(8, 10));
}

function monthOf(day: string): { year: number; month: number } {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

async function balanceOf(ctx: SeedContext, branchId: string, itemKey: string): Promise<number> {
  const [row] = await ctx.db
    .select({ quantity: branchStockBalances.quantity })
    .from(branchStockBalances)
    .where(and(eq(branchStockBalances.branch_id, branchId), eq(branchStockBalances.inventory_item_id, ctx.inventory[itemKey])));
  return row ? Number(row.quantity) : 0;
}

export async function runBackOffice(ctx: SeedContext, day: string, firstDay: string, lastDay: string) {
  ctx.clock.set(cairoTime(day, 7, 30));
  await safely(ctx, "payables", () => payDueInvoices(ctx, day));
  if (weekday(day) === 6 || day === firstDay) await safely(ctx, "production", () => weeklyProduction(ctx, day));
  if (weekday(day) === 6 || weekday(day) === 3) await safely(ctx, "transfers", () => transfersToBranches(ctx, day));
  if (weekday(day) === 0 || weekday(day) === 3) await safely(ctx, "procurement", () => replenish(ctx, day));
  if (weekday(day) === 6 && day !== firstDay) await safely(ctx, "reconciliation", () => weeklySettlements(ctx, day));
  if (weekday(day) === 1) await safely(ctx, "bankDeposits", () => bankDeposits(ctx, day));
  await safely(ctx, "expenses", () => monthlyExpenses(ctx, day));
  await safely(ctx, "hr", () => hrActivity(ctx, day, firstDay));
  if (dayOfMonth(day) === 1 && day !== firstDay) await safely(ctx, "payroll", () => payroll(ctx, day, firstDay));
  if (dayOfMonth(day) === 6 && addDays(day, -6) >= firstDay) await safely(ctx, "periodClose", () => closePreviousPeriod(ctx, day));
  if (dayOfMonth(addDays(day, 1)) === 1) await safely(ctx, "depreciation", () => depreciation(ctx, day));
  if (day === addDays(firstDay, 20)) await safely(ctx, "priceChange", () => priceIncrease(ctx, day));
  if (day === addDays(firstDay, 12)) await safely(ctx, "purchaseReturn", () => purchaseReturn(ctx, day));
  if (day === addDays(lastDay, -1)) await safely(ctx, "stocktake", () => stocktakes(ctx, day));
  if (day === lastDay) await safely(ctx, "writeOffs", () => writeOffs(ctx, day));
}

async function safely(ctx: SeedContext, step: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    reportFailure(ctx, step, err);
  }
}

async function weeklyProduction(ctx: SeedContext, day: string) {
  const central = ctx.branches.central;
  const plans = [
    { key: "dough", minimum: 170, notes: "عجين الأسبوع لكل الفروع - يتجمد ويتوزع على دفعتين" },
    { key: "sauce", minimum: 45, notes: "صلصة بيتزا الأسبوع" },
  ];
  for (const { key, minimum, notes } of plans) {
    const weeklyNeed = 2 * (await branchShortfall(ctx, key)) - (await balanceOf(ctx, central, key));
    const plan = { key, notes, planned: Math.max(minimum, Math.ceil(weeklyNeed * 1.1)) };
    ctx.clock.set(cairoTime(day, 7, 45));
    const order = await handler(ctx, RegisterConversionOrderHandler).execute({ branchId: central, recipeId: manufacturedRecipeIds[plan.key], plannedOutputQuantity: plan.planned, notes: plan.notes, createdBy: ctx.users.centralBaker });
    await handler(ctx, ApproveConversionOrderHandler).execute({ conversionOrderId: order.id, approvedBy: ctx.users.centralManager });
    ctx.clock.advanceMinutes(10);
    await handler(ctx, StartConversionOrderHandler).execute({ conversionOrderId: order.id, performedBy: ctx.users.centralBaker });
    ctx.clock.advanceMinutes(150);
    const actual = round2(plan.planned * (0.975 + ctx.rand() * 0.04));
    await handler(ctx, CompleteConversionOrderHandler).execute({
      conversionOrderId: order.id,
      actualOutputQuantity: actual,
      varianceReason: actual < plan.planned ? "هالك عجين أثناء التقطيع" : null,
      expiryDate: new Date(`${addDays(day, plan.key === "dough" ? 14 : 10)}T00:00:00Z`),
      completedBy: ctx.users.centralManager,
    });
    await audit(ctx, ctx.users.centralManager, "POST /production/conversion-orders/:id/complete", "conversion_order", order.id, central, { output: actual });
    count(ctx, "conversionOrders");
  }
}

function floor2(value: number): number {
  return Math.max(0, Math.floor(value * 100 - 1e-6) / 100);
}

async function shortfallAt(ctx: SeedContext, branchKey: string, itemKey: string): Promise<number> {
  const target = INVENTORY.find((spec) => spec.key === itemKey)?.branchOpening ?? 0;
  return Math.max(0, target - (await balanceOf(ctx, ctx.branches[branchKey], itemKey)));
}

async function branchShortfall(ctx: SeedContext, itemKey: string): Promise<number> {
  let total = 0;
  for (const branchKey of RETAIL_BRANCH_KEYS) total += await shortfallAt(ctx, branchKey, itemKey);
  return total;
}

async function transfersToBranches(ctx: SeedContext, day: string) {
  const central = ctx.branches.central;
  for (const branchKey of RETAIL_BRANCH_KEYS) {
    const dough = floor2(Math.min(await balanceOf(ctx, central, "dough"), await shortfallAt(ctx, branchKey, "dough")));
    const sauce = floor2(Math.min(await balanceOf(ctx, central, "sauce"), await shortfallAt(ctx, branchKey, "sauce")));
    const lines = [
      { inventoryItemId: ctx.inventory.dough, requestedQuantity: dough },
      { inventoryItemId: ctx.inventory.sauce, requestedQuantity: sauce },
    ].filter((l) => l.requestedQuantity > 0);
    if (lines.length === 0) continue;
    const manager = ctx.users[`${branchKey === "heliopolis" ? "helio" : branchKey}Manager`];
    ctx.clock.set(cairoTime(day, 8, 20));
    const request = await handler(ctx, RegisterTransferRequestHandler).execute({ fromBranchId: central, toBranchId: ctx.branches[branchKey], requestedBy: manager, requiredDate: new Date(`${day}T00:00:00Z`), notes: "تحويل العجين والصلصة الدوري", lines });
    ctx.clock.advanceMinutes(15);
    await handler(ctx, ApproveTransferRequestHandler).execute({ requestId: request.id, approvedBy: ctx.users.centralManager });
    ctx.clock.advanceMinutes(30);
    await handler(ctx, DispatchTransferRequestHandler).execute({ requestId: request.id, dispatchedBy: ctx.users.centralStore });
    ctx.clock.advanceMinutes(70);
    await handler(ctx, ReceiveTransferRequestHandler).execute({ requestId: request.id, receivedBy: manager });
    count(ctx, "transfers");
  }
}

async function replenish(ctx: SeedContext, day: string) {
  for (const branch of BRANCHES) {
    const branchId = ctx.branches[branch.key];
    const central = branch.key === "central";
    const needs: Record<string, { itemKey: string; quantity: number }[]> = {};
    for (const spec of INVENTORY) {
      if (spec.supplier === "central") continue;
      const opening = central ? spec.centralOpening : spec.branchOpening;
      if (opening <= 0) continue;
      const balance = await balanceOf(ctx, branchId, spec.key);
      if (balance > opening * 0.6) continue;
      const quantity = Math.ceil(opening - balance);
      if (quantity > 0) (needs[spec.supplier] ??= []).push({ itemKey: spec.key, quantity });
    }
    for (const [supplierKey, lines] of Object.entries(needs)) {
      await procure(ctx, day, branch.key, supplierKey, lines);
    }
  }
}

async function procure(ctx: SeedContext, day: string, branchKey: string, supplierKey: string, lines: { itemKey: string; quantity: number }[]) {
  const branchId = ctx.branches[branchKey];
  const supplierId = ctx.suppliers[supplierKey];
  const managerKey = branchKey === "central" ? "centralManager" : `${branchKey === "heliopolis" ? "helio" : branchKey}Manager`;
  const manager = ctx.users[managerKey];
  const priced = lines.map((l) => {
    const spec = INVENTORY.find((i) => i.key === l.itemKey)!;
    return { ...l, spec, unitPrice: round2(spec.unitCost * (0.97 + ctx.rand() * 0.07)) };
  });

  ctx.clock.set(cairoTime(day, 9, between(ctx.rand, 0, 30)));
  let purchaseRequestId: string | null = null;
  if (branchKey === "central") {
    const request = await handler(ctx, RegisterPurchaseRequestHandler).execute({
      branchId,
      requestedBy: ctx.users.centralStore,
      requiredDate: new Date(`${addDays(day, 1)}T00:00:00Z`),
      reason: "الرصيد قرب من حد إعادة الطلب",
      lines: priced.map((l) => ({ inventoryItemId: ctx.inventory[l.itemKey], requestedQuantity: l.quantity, unit: l.spec.unit })),
    });
    await handler(ctx, SubmitPurchaseRequestHandler).execute(request.id);
    ctx.clock.advanceMinutes(25);
    await handler(ctx, ApprovePurchaseRequestHandler).execute({ purchaseRequestId: request.id, approvedBy: ctx.users.opsAdmin });
    purchaseRequestId = request.id;
    count(ctx, "purchaseRequests");
  }
  ctx.clock.advanceMinutes(10);
  const po = await handler(ctx, RegisterPurchaseOrderHandler).execute({
    supplierId,
    branchId,
    purchaseRequestId,
    lines: priced.map((l) => ({ inventoryItemId: ctx.inventory[l.itemKey], quantity: l.quantity, unitPrice: l.unitPrice })),
    createdBy: manager,
  });
  await handler(ctx, SendPurchaseOrderHandler).execute(po.id);
  await audit(ctx, manager, "POST /procurement/purchase-orders", "purchase_order", po.id, branchId, { supplier: supplierKey });
  count(ctx, "purchaseOrders");

  ctx.clock.advanceMinutes(between(ctx.rand, 120, 240));
  const partial = ctx.rand() < 0.08;
  const received = priced.map((l, i) => ({ ...l, received: partial && i === 0 ? Math.max(1, Math.floor(l.quantity * 0.6)) : l.quantity }));
  const supplierDoc = `${supplierKey.toUpperCase()}-${day.replace(/-/g, "")}-${++goodsReceiptsSeen}`;
  const grn = await handler(ctx, RegisterGoodsReceiptHandler).execute({
    purchaseOrderId: po.id,
    supplierDocumentNumber: supplierDoc,
    branchId,
    receivedBy: branchKey === "central" ? ctx.users.centralStore : manager,
    lines: received.map((l) => ({
      inventoryItemId: ctx.inventory[l.itemKey],
      quantity: l.received,
      unitCost: l.unitPrice,
      productionDate: l.spec.perishableDays ? new Date(`${addDays(day, -1)}T00:00:00Z`) : null,
      expiryDate: l.spec.perishableDays ? new Date(`${addDays(day, l.spec.perishableDays)}T00:00:00Z`) : null,
    })),
  });
  await handler(ctx, ConfirmGoodsReceiptHandler).execute({ goodsReceiptId: grn.id, confirmedBy: manager });
  await audit(ctx, manager, "POST /procurement/goods-receipts/:id/confirm", "goods_receipt", grn.id, branchId, { supplierDocumentNumber: supplierDoc });
  count(ctx, "goodsReceipts");

  ctx.clock.advanceMinutes(60);
  const priceVariance = ctx.rand() < 0.1;
  const invoice = await handler(ctx, RegisterSupplierInvoiceHandler).execute({
    supplierId,
    branchId,
    goodsReceiptId: grn.id,
    supplierInvoiceNumber: `INV-${++invoiceSequence}`,
    invoiceDate: new Date(`${day}T00:00:00Z`),
    dueDate: new Date(`${addDays(day, PAYMENT_TERM_DAYS[supplierKey])}T00:00:00Z`),
    lines: received.map((l, i) => ({ inventoryItemId: ctx.inventory[l.itemKey], invoicedQuantity: l.received, unitPrice: priceVariance && i === 0 ? round2(l.unitPrice * 1.02) : l.unitPrice })),
    tax: 0,
    notes: priceVariance ? "المورد رفع السعر 2% بدون إخطار مسبق" : null,
    createdBy: ctx.users.accountant,
  });
  ctx.clock.advanceMinutes(30);
  await handler(ctx, ApproveSupplierInvoiceHandler).execute({ supplierInvoiceId: invoice.id, approvedBy: ctx.users.chiefAccountant });
  count(ctx, "supplierInvoices");

  const terms = PAYMENT_TERM_DAYS[supplierKey];
  payables.push({ supplierId, branchId, invoiceId: invoice.id, amount: Number(invoice.total), dueDay: addDays(day, terms), fromBank: terms > 0 });
  if (terms === 0) await payDueInvoices(ctx, day);
}

async function payDueInvoices(ctx: SeedContext, day: string) {
  for (const due of payables.filter((p) => p.dueDay <= day)) {
    const branchKey = Object.entries(ctx.branches).find(([, id]) => id === due.branchId)![0];
    const installments = due.fromBank && due.amount > 15000 && ctx.rand() < 0.4 ? [round2(due.amount * 0.5), round2(due.amount - round2(due.amount * 0.5))] : [due.amount];
    for (const [i, amount] of installments.entries()) {
      await handler(ctx, RegisterSupplierPaymentHandler).execute({
        supplierId: due.supplierId,
        branchId: due.branchId,
        amount,
        supplierInvoiceId: due.invoiceId,
        treasuryId: due.fromBank ? ctx.bankTreasuryId : ctx.treasuries[branchKey],
        paymentDate: new Date(`${day}T00:00:00Z`),
        referenceNumber: due.fromBank ? `TRF-${day.replace(/-/g, "")}-${between(ctx.rand, 1000, 9999)}` : null,
        notes: installments.length > 1 ? `دفعة ${i + 1} من ${installments.length}` : null,
        createdBy: ctx.users.chiefAccountant,
      });
      count(ctx, "supplierPayments");
    }
    payables.splice(payables.indexOf(due), 1);
  }
}

async function weeklySettlements(ctx: SeedContext, day: string) {
  const record = handler(ctx, RegisterReconciliationRecordHandler);
  for (const branchKey of RETAIL_BRANCH_KEYS) {
    const tally = weeklyCardSales[branchKey] ?? {};
    const entries: [string, string, number][] = [
      ["visa_settlement", "visa", 0.0225],
      ["orange_cash", "orange", 0.015],
      ["talabat_statement", "talabatOnline", 0.18],
    ];
    for (const [source, key, fee] of entries) {
      const gross = tally[key] ?? 0;
      if (gross <= 0) continue;
      await record.execute({
        branchId: ctx.branches[branchKey],
        source,
        externalReference: `${source.toUpperCase()}-${branchKey.toUpperCase()}-${day.replace(/-/g, "")}`,
        externalAmount: round2(gross * (1 - fee)),
        externalDate: cairoTime(addDays(day, -1), 12),
        notes: `تسوية أسبوعية - إجمالي ${gross} جنيه بعد خصم عمولة ${fee * 100}%`,
        enteredBy: ctx.users.accountant,
      });
      count(ctx, "reconciliationRecords");
    }
    weeklyCardSales[branchKey] = {};
  }
  const result = await handler(ctx, AutoMatchReconciliationRecordsHandler).execute();
  count(ctx, "reconciliationAutoMatched", result.matched);
}

async function bankDeposits(ctx: SeedContext, day: string) {
  ctx.clock.set(cairoTime(day, 10, 15));
  const bankAccountId = ctx.accounts[`treasury:${ctx.bankTreasuryId}`];
  const lines = RETAIL_BRANCH_KEYS.map((key) => ({ key, amount: between(ctx.rand, 38, 62) * 1000 }));
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const entry = await handler(ctx, RegisterJournalEntryHandler).execute({
    description: "إيداع نقدية مبيعات الأسبوع في البنك الأهلي",
    sourceType: "manual",
    lines: [
      { accountId: bankAccountId, debit: total, credit: 0, description: "إيداع نقدي" },
      ...lines.map((l) => ({ accountId: ctx.accounts["1100"], debit: 0, credit: l.amount, description: `نقدية ${BRANCHES.find((b) => b.key === l.key)!.name}` })),
    ],
    createdBy: ctx.users.accountant,
  });
  await handler(ctx, PostJournalEntryHandler).execute({ entryId: entry.id, postedBy: ctx.users.chiefAccountant });
  count(ctx, "manualJournals");
}

async function monthlyExpenses(ctx: SeedContext, day: string) {
  const dom = dayOfMonth(day);
  const register = handler(ctx, RegisterExpenseHandler);
  const businessDate = new Date(`${day}T00:00:00Z`);
  if (dom === 1) {
    ctx.clock.set(cairoTime(day, 10, 0));
    for (const branch of BRANCHES) {
      await register.execute({ branchId: ctx.branches[branch.key], businessDate, categoryId: ctx.expenseCategories.rent, amount: MONTHLY_RENT[branch.key], notes: `إيجار شهر ${day.slice(0, 7)}`, requestedStatus: "POSTED", createdBy: ctx.users.accountant, idempotencyKey: `rent-${branch.key}-${day.slice(0, 7)}` });
      count(ctx, "expenses");
    }
  }
  if (dom === 5) {
    for (const branchKey of RETAIL_BRANCH_KEYS) {
      const manager = ctx.users[`${branchKey === "heliopolis" ? "helio" : branchKey}Manager`];
      ctx.clock.set(cairoTime(day, 12, between(ctx.rand, 0, 30)));
      const expense = await register.execute({ branchId: ctx.branches[branchKey], businessDate, categoryId: ctx.expenseCategories.utilities, amount: between(ctx.rand, 8500, 14500), notes: "فاتورة الكهرباء والغاز والمياه", requestedStatus: "SUBMITTED", createdBy: manager });
      ctx.clock.advanceMinutes(90);
      await handler(ctx, ReviewExpenseHandler).execute({ expenseId: expense.id, reviewedBy: ctx.users.accountant });
      count(ctx, "expenses");
    }
  }
  if (dom === 3 || dom === 17) {
    ctx.clock.set(cairoTime(day, 11, 0));
    await register.execute({ branchId: ctx.branches.nasr, businessDate, categoryId: ctx.expenseCategories.marketing, amount: between(ctx.rand, 7, 12) * 1000, notes: "حملة ممولة فيسبوك وإنستجرام", requestedStatus: "POSTED", createdBy: ctx.users.opsAdmin });
    count(ctx, "expenses");
  }
  if (dom === 2) {
    ctx.clock.set(cairoTime(day, 11, 30));
    await register.execute({ branchId: ctx.branches.nasr, businessDate, categoryId: ctx.expenseCategories.commissions, amount: between(ctx.rand, 18, 26) * 1000, notes: "عمولة طلبات عن الشهر السابق", requestedStatus: "POSTED", createdBy: ctx.users.accountant });
    count(ctx, "expenses");
  }
  if (ctx.rand() < 0.12) {
    const branchKey = pick(ctx.rand, BRANCHES).key;
    ctx.clock.set(cairoTime(day, 14, between(ctx.rand, 0, 50)));
    const draft = await register.execute({ branchId: ctx.branches[branchKey], businessDate, categoryId: ctx.expenseCategories.maintenance, amount: between(ctx.rand, 6, 45) * 100, notes: pick(ctx.rand, ["صيانة فرن البيتزا", "تغيير كمبروسر التلاجة", "إصلاح شفاط المطبخ", "صيانة ماكينة العجين"]), requestedStatus: "DRAFT", createdBy: ctx.users.opsAdmin });
    await handler(ctx, SubmitExpenseHandler).execute({ expenseId: draft.id });
    ctx.clock.advanceMinutes(120);
    await handler(ctx, ReviewExpenseHandler).execute({ expenseId: draft.id, reviewedBy: ctx.users.chiefAccountant });
    count(ctx, "expenses");
  }
}

async function hrActivity(ctx: SeedContext, day: string, firstDay: string) {
  const dom = dayOfMonth(day);
  const adjust = handler(ctx, RegisterPayrollAdjustmentHandler);
  ctx.clock.set(cairoTime(day, 9, 45));
  if (dom === 14) {
    for (const key of ["nasrChef", "helioCashier", "centralBaker"]) {
      await adjust.execute({ employeeId: ctx.employees[key], entryDate: new Date(`${day}T00:00:00Z`), adjustmentType: "advance", amount: between(ctx.rand, 15, 30) * 100, notes: "سلفة منتصف الشهر", createdBy: ctx.users.accountant });
      count(ctx, "payrollAdjustments");
    }
  }
  if (dom === 20) {
    await adjust.execute({ employeeId: ctx.employees.maadiCashier, entryDate: new Date(`${day}T00:00:00Z`), adjustmentType: "penalty", amount: 250, notes: "تأخير متكرر عن ميعاد فتح الشيفت", createdBy: ctx.users.accountant });
    await adjust.execute({ employeeId: ctx.employees.nasrManager, entryDate: new Date(`${day}T00:00:00Z`), adjustmentType: "bonus", amount: 2000, notes: "أعلى مبيعات بين الفروع", createdBy: ctx.users.accountant });
    count(ctx, "payrollAdjustments", 2);
  }
  if (day === addDays(firstDay, 3) || day === addDays(firstDay, 24)) {
    const requester = pick(ctx.rand, STAFF.filter((s) => s.roles.includes("employee")));
    const leave = await handler(ctx, RegisterLeaveRequestHandler).execute({
      userId: ctx.users[requester.key],
      leaveType: pick(ctx.rand, ["اعتيادية", "عارضة", "مرضية"]),
      startDate: new Date(`${addDays(day, 7)}T00:00:00Z`),
      endDate: new Date(`${addDays(day, 8)}T00:00:00Z`),
      reason: "ظروف عائلية",
    });
    const manager = STAFF.find((s) => s.branchKey === requester.branchKey && s.roles.includes("branch_manager"))!;
    await handler(ctx, ReviewLeaveRequestHandler).execute({ leaveRequestId: leave.id, decision: day === addDays(firstDay, 3) ? "approve" : "reject", notes: day === addDays(firstDay, 3) ? null : "ضغط شغل نهاية الأسبوع", reviewerId: ctx.users[manager.key] });
    count(ctx, "leaveRequests");
  }
}

async function payroll(ctx: SeedContext, day: string, firstDay: string) {
  const previous = addDays(day, -1);
  if (previous.slice(0, 7) < firstDay.slice(0, 7)) return;
  const { year, month } = monthOf(previous);
  ctx.clock.set(cairoTime(day, 10, 30));
  const employees = [
    ...STAFF.map((s) => ({ employeeId: ctx.employees[s.key], branchId: s.branchKey ? ctx.branches[s.branchKey] : null, grossPay: s.baseSalary })),
    ...DRIVERS.map((d, i) => ({ employeeId: ctx.employees[`driver${i}`], branchId: ctx.branches[d.branchKey], grossPay: 26 * 10 * 35 })),
  ];
  const run = await handler(ctx, RegisterPayrollRunHandler).execute({ year, month, employees, createdBy: ctx.users.accountant });
  ctx.clock.advanceMinutes(60);
  await handler(ctx, ApprovePayrollRunHandler).execute({ payrollRunId: run.id, approvedBy: ctx.users.chiefAccountant });
  await audit(ctx, ctx.users.chiefAccountant, "POST /hr-payroll/payroll-runs/:id/approve", "payroll_run", run.id, null, { year, month });
  count(ctx, "payrollRuns");

  const net = round2(employees.reduce((s, e) => s + e.grossPay, 0) * 0.97);
  ctx.clock.advanceMinutes(30);
  await handler(ctx, TransferBetweenTreasuriesHandler).execute({ fromTreasuryId: ctx.bankTreasuryId, toTreasuryId: ctx.treasuries.salary, amount: net, notes: `تمويل حساب الرواتب - ${month}/${year}`, createdBy: ctx.users.chiefAccountant });
  const entry = await handler(ctx, RegisterJournalEntryHandler).execute({
    description: `صرف رواتب شهر ${month}/${year} بالتحويل البنكي`,
    sourceType: "manual",
    lines: [
      { accountId: ctx.accounts["2400"], debit: net, credit: 0 },
      { accountId: ctx.accounts[`treasury:${ctx.treasuries.salary}`], debit: 0, credit: net },
    ],
    createdBy: ctx.users.accountant,
  });
  await handler(ctx, PostJournalEntryHandler).execute({ entryId: entry.id, postedBy: ctx.users.chiefAccountant });
  count(ctx, "manualJournals");

  if (previous.slice(0, 7) === firstDay.slice(0, 7)) {
    await handler(ctx, UpdateEmployeeHandler).execute({ employeeId: ctx.employees.nasrChef, actorIsAdmin: true, positionId: positionIds.HEAD_CHEF, baseSalary: 12500, changedBy: ctx.users.owner, reason: "ترقية لشيف أول بعد تقييم الأداء" });
    await handler(ctx, UpdateEmployeeHandler).execute({ employeeId: ctx.employees.helioCashier, actorIsAdmin: true, baseSalary: 8800, changedBy: ctx.users.owner, reason: "زيادة سنوية" });
    count(ctx, "employeeChanges", 2);
  }
}

async function closePreviousPeriod(ctx: SeedContext, day: string) {
  const { year, month } = monthOf(addDays(day, -10));
  ctx.clock.set(cairoTime(day, 16, 0));
  const period = await handler(ctx, ClosePeriodHandler).execute({ year, month, closedBy: ctx.users.chiefAccountant });
  await audit(ctx, ctx.users.chiefAccountant, "POST /accounting/periods/close", "accounting_period", period.id, null, { year, month });
  count(ctx, "periodsClosed");
}

async function depreciation(ctx: SeedContext, day: string) {
  ctx.clock.set(cairoTime(day, 15, 0));
  const lines = [
    { account: "1510", amount: 15416.67, label: "إهلاك المعدات - 10 سنين" },
    { account: "1520", amount: 10666.67, label: "إهلاك الأثاث - 5 سنين" },
    { account: "1530", amount: 6500, label: "إهلاك الموتوسيكلات - 5 سنين" },
  ];
  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  const entry = await handler(ctx, RegisterJournalEntryHandler).execute({
    description: `قيد الإهلاك الشهري ${day.slice(0, 7)}`,
    sourceType: "manual",
    lines: [{ accountId: ctx.accounts["6700"], debit: total, credit: 0, description: "مصروف الإهلاك" }, ...lines.map((l) => ({ accountId: ctx.accounts["1590"], debit: 0, credit: l.amount, description: l.label }))],
    createdBy: ctx.users.accountant,
  });
  await handler(ctx, PostJournalEntryHandler).execute({ entryId: entry.id, postedBy: ctx.users.chiefAccountant });
  count(ctx, "manualJournals");
}

async function priceIncrease(ctx: SeedContext, day: string) {
  ctx.clock.set(cairoTime(day, 8, 0));
  const update = handler(ctx, UpdateVariantHandler);
  for (const itemKey of ["margherita", "sausage", "supreme", "cheeseBurger"]) {
    const spec = MENU.flatMap((c) => c.items).find((i) => i.key === itemKey)!;
    const ref = ctx.menuItems[itemKey];
    for (const variant of spec.variants) {
      const price = variant.price + 10;
      await update.execute({ itemId: ref.id, variantId: ctx.variants[`${itemKey}:${variant.label}`], price, talabatPrice: Math.round((price * 1.12) / 5) * 5, changedBy: ctx.users.owner });
      count(ctx, "priceChanges");
    }
  }
}

async function purchaseReturn(ctx: SeedContext, day: string) {
  ctx.clock.set(cairoTime(day, 10, 40));
  const draft = await handler(ctx, RegisterPurchaseReturnHandler).execute({
    branchId: ctx.branches.nasr,
    supplierId: ctx.suppliers.dairy,
    reason: "جبنة موتزاريلا مخالفة للمواصفات - نسبة دهون عالية",
    notes: "تم التواصل مع المندوب وهيتم الخصم من الفاتورة الجاية",
    createdBy: ctx.users.nasrManager,
    lines: [{ inventoryItemId: ctx.inventory.mozzarella, quantity: 6, unit: "كجم" }],
  });
  await handler(ctx, PostPurchaseReturnHandler).execute({ purchaseReturnId: draft.id, postedBy: ctx.users.chiefAccountant });
  count(ctx, "purchaseReturns");
}

async function stocktakes(ctx: SeedContext, day: string) {
  for (const branchKey of RETAIL_BRANCH_KEYS) {
    ctx.clock.set(cairoTime(day, 9, 0));
    const lines = [];
    for (const key of ["mozzarella", "sausage", "chicken", "pepsi", "pizzaBox", "flour"]) {
      const balance = await balanceOf(ctx, ctx.branches[branchKey], key);
      const unit = INVENTORY.find((i) => i.key === key)!.unit;
      const shrink = unit === "كجم" ? round2(-(ctx.rand() * 1.5)) : -between(ctx.rand, 0, 4);
      lines.push({ inventoryItemId: ctx.inventory[key], actualQuantity: Math.max(0, round2(balance + shrink)), reason: shrink ? "هالك وفرق وزن" : null, chargeAccountCode: "5300" });
    }
    const manager = ctx.users[`${branchKey === "heliopolis" ? "helio" : branchKey}Manager`];
    await handler(ctx, RegisterStocktakeHandler).execute({ branchId: ctx.branches[branchKey], createdBy: manager, notes: "جرد آخر الشهر الدوري", lines });
    count(ctx, "stocktakes");
  }
}

async function writeOffs(ctx: SeedContext, day: string) {
  ctx.clock.set(cairoTime(day, 9, 30));
  const batches = await ctx.db
    .select({ id: inventoryBatches.id, remaining: inventoryBatches.remaining_quantity, expiry: inventoryBatches.expiry_date })
    .from(inventoryBatches)
    .where(eq(inventoryBatches.status, "active"));
  const expired = batches.filter((b) => b.expiry && new Date(b.expiry).getTime() < new Date(`${day}T00:00:00Z`).getTime());
  for (const batch of expired.slice(0, 6)) {
    await handler(ctx, WriteOffInventoryBatchHandler).execute({ batchId: batch.id, markExpired: true });
    count(ctx, "batchWriteOffs");
  }
  const partial = batches.find((b) => !expired.includes(b) && Number(b.remaining) > 2);
  if (partial) {
    await handler(ctx, WriteOffInventoryBatchHandler).execute({ batchId: partial.id, quantity: 1 });
    count(ctx, "batchWriteOffs");
  }
}
