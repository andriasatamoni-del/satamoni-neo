import { createHmac, randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { orders } from "../../../src/contexts/orders/infrastructure/persistence/orders.tables";
import { payments } from "../../../src/contexts/payment-control/infrastructure/persistence/payment-control.tables";
import { talabatOrders } from "../../../src/contexts/talabat/infrastructure/persistence/talabat.tables";
import { printJobs } from "../../../src/contexts/printing/infrastructure/persistence/printing.tables";
import { RegisterOrderHandler } from "../../../src/contexts/orders/application/commands/register-order.handler";
import { AdvanceKitchenStatusHandler } from "../../../src/contexts/orders/application/commands/advance-kitchen-status.handler";
import { UpdateOrderStatusHandler } from "../../../src/contexts/orders/application/commands/update-order-status.handler";
import { CancelOrderHandler } from "../../../src/contexts/orders/application/commands/cancel-order.handler";
import { SubmitOrderRatingHandler } from "../../../src/contexts/orders/application/commands/submit-order-rating.handler";
import { AssignDriverHandler } from "../../../src/contexts/delivery/application/commands/assign-driver.handler";
import { UpdateDeliveryStatusHandler } from "../../../src/contexts/delivery/application/commands/update-delivery-status.handler";
import { CheckInDriverHandler } from "../../../src/contexts/delivery/application/commands/check-in-driver.handler";
import { CheckOutDriverHandler } from "../../../src/contexts/delivery/application/commands/check-out-driver.handler";
import { RegisterDriverSettlementHandler } from "../../../src/contexts/delivery/application/commands/register-driver-settlement.handler";
import { ReviewDriverSettlementHandler } from "../../../src/contexts/delivery/application/commands/review-driver-settlement.handler";
import { OpenShiftHandler } from "../../../src/contexts/shifts/application/commands/open-shift.handler";
import { CloseShiftHandler } from "../../../src/contexts/shifts/application/commands/close-shift.handler";
import { RegisterCashDrawerEntryHandler } from "../../../src/contexts/shifts/application/commands/register-cash-drawer-entry.handler";
import { ReviewShiftVarianceHandler } from "../../../src/contexts/shifts/application/commands/review-shift-variance.handler";
import { CloseBranchDayHandler } from "../../../src/contexts/branch-day/application/commands/close-branch-day.handler";
import { CheckInEmployeeHandler } from "../../../src/contexts/hr-payroll/application/commands/check-in-employee.handler";
import { CheckOutEmployeeHandler } from "../../../src/contexts/hr-payroll/application/commands/check-out-employee.handler";
import { RequestPaymentAdjustmentHandler } from "../../../src/contexts/payment-control/application/commands/request-payment-adjustment.handler";
import { ApprovePaymentAdjustmentHandler } from "../../../src/contexts/payment-control/application/commands/approve-payment-adjustment.handler";
import { RegisterReconciliationRecordHandler } from "../../../src/contexts/payment-control/application/commands/register-reconciliation-record.handler";
import { PlaceOnlineOrderHandler } from "../../../src/contexts/storefront/application/commands/place-online-order.handler";
import { ReceiveTalabatWebhookHandler } from "../../../src/contexts/talabat/application/commands/receive-talabat-webhook.handler";
import { ReceiveWhatsappMessageHandler } from "../../../src/contexts/whatsapp/application/commands/receive-whatsapp-message.handler";
import { RegisterPendingOrderHandler } from "../../../src/contexts/whatsapp/application/commands/register-pending-order.handler";
import { ConfirmPendingOrderHandler } from "../../../src/contexts/whatsapp/application/commands/confirm-pending-order.handler";
import { RejectPendingOrderHandler } from "../../../src/contexts/whatsapp/application/commands/reject-pending-order.handler";
import { SendWhatsappReplyHandler } from "../../../src/contexts/whatsapp/application/commands/send-whatsapp-reply.handler";
import { RegisterComplaintFromConversationHandler } from "../../../src/contexts/whatsapp/application/commands/register-complaint-from-conversation.handler";
import { RecordFollowupHandler } from "../../../src/contexts/crm/application/commands/record-followup.handler";
import { UpdateComplaintStatusHandler } from "../../../src/contexts/crm/application/commands/update-complaint-status.handler";
import { RegisterPurchaseHandler } from "../../../src/contexts/purchases/application/commands/register-purchase.handler";
import { ConfirmPurchaseHandler } from "../../../src/contexts/purchases/application/commands/confirm-purchase.handler";
import { RejectPurchaseHandler } from "../../../src/contexts/purchases/application/commands/reject-purchase.handler";
import { ClaimPrintJobHandler } from "../../../src/contexts/printing/application/commands/claim-print-job.handler";
import { MarkPrintJobPrintedHandler } from "../../../src/contexts/printing/application/commands/mark-print-job-printed.handler";
import { AuditLogService } from "../../../src/shared/audit/audit-log.service";
import { BRANCHES, COMPLAINT_TEXTS, INVENTORY, MENU, PAYMENT_METHODS, RATING_COMMENTS, STAFF, egyptianMobile, egyptianName, type BranchSpec } from "./demo-data";
import { talabatItemId } from "./master-data";
import { cairoTime } from "./clock";
import { between, count, handler, pick, round2, weighted, type CustomerRef, type SeedContext } from "./seed-context";

export const TALABAT_SEED_SECRET = "local-demo-talabat-secret";

type OrderLine = { variantId?: string; comboId?: string; quantity: number; modifierIds?: string[] };
type Channel = "pos" | "callcenter" | "website" | "talabat" | "whatsapp";

interface PlacedOrder {
  id: string;
  total: number;
  orderType: string;
  paymentKey: string;
  ratingToken: string | null;
  customerPhone: string | null;
  ownDelivery: boolean;
}

interface BranchDayState {
  spec: BranchSpec;
  branchId: string;
  cashierId: string;
  managerId: string;
  shiftId: string;
  cashierCashSales: number;
  drawerOut: number;
  driverCash: Record<string, number>;
  driverDelivered: Record<string, number>;
  driverShifts: Record<string, string>;
  attendance: { userId: string; shiftId: string }[];
  completed: PlacedOrder[];
  cashierCashOrders: PlacedOrder[];
}

export interface OpenComplaint {
  id: string;
  openedOn: string;
}

export const openComplaints: OpenComplaint[] = [];
export const instapayPayments: { orderId: string; amount: number; branchId: string; day: string }[] = [];
export const weeklyCardSales: Record<string, Record<string, number>> = {};
let talabatSequence = 880_000;
let waSequence = 1;

const SHOW_ERRORS = 8;
let shownErrors = 0;

export function reportFailure(ctx: SeedContext, step: string, err: unknown) {
  const name = err instanceof Error ? err.constructor.name : "UnknownError";
  count(ctx, `failed:${step}:${name}`);
  if (shownErrors++ < SHOW_ERRORS) console.warn(`   ⚠️  ${step}: ${name}: ${err instanceof Error ? err.message : String(err)}`);
}

export async function audit(ctx: SeedContext, actorUserId: string, action: string, entityType: string, entityId: string, branchId: string | null, metadata?: Record<string, unknown>) {
  await handler(ctx, AuditLogService).record({ actorUserId, action, entityType, entityId, branchId, metadata: metadata ?? null, httpStatus: 201 });
  count(ctx, "auditLogs");
}

function staffAt(branchKey: string) {
  return STAFF.filter((s) => s.branchKey === branchKey);
}

function isFastingDay(day: string): boolean {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return weekday === 3 || weekday === 5;
}

function weekendFactor(day: string): number {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return weekday === 4 || weekday === 5 ? 1.35 : weekday === 6 ? 1.1 : 1;
}

function orderTimes(ctx: SeedContext, day: string, n: number): Date[] {
  const times: Date[] = [];
  for (let i = 0; i < n; i++) {
    const dinner = ctx.rand() < 0.62;
    const hour = dinner ? between(ctx.rand, 18, 22) : between(ctx.rand, 12, 17);
    const minute = hour === 22 ? between(ctx.rand, 0, 45) : between(ctx.rand, 0, 59);
    times.push(cairoTime(day, hour, minute));
  }
  return times.sort((a, b) => a.getTime() - b.getTime());
}

function basket(ctx: SeedContext, day: string, opts: { online: boolean; combos: boolean }): OrderLine[] {
  const fasting = isFastingDay(day);
  const entries = Object.entries(ctx.menuItems);
  const lines: OrderLine[] = [];
  const lineCount = weighted(ctx.rand, [1, 2, 3, 4], (n) => [30, 38, 22, 10][n - 1]);
  if (opts.combos && ctx.rand() < 0.14) {
    const combos = Object.entries(ctx.combos).filter(([name]) => opts.online || name !== "عرض الأونلاين");
    lines.push({ comboId: pick(ctx.rand, combos)[1], quantity: 1 });
  }
  while (lines.length < lineCount) {
    const [key, item] = weighted(ctx.rand, entries, ([, ref]) => ref.popularity * (ref.categoryKey === "fasting" ? (fasting ? 6 : 0.3) : 1));
    const variant = item.variants.length === 3 ? weighted(ctx.rand, item.variants, (v) => (v.label === "وسط" ? 45 : v.label === "كبير" ? 35 : 20)) : pick(ctx.rand, item.variants);
    const isDrink = MENU.find((c) => c.key === "drinks")!.items.some((i) => i.key === key);
    const line: OrderLine = { variantId: variant.id, quantity: isDrink ? between(ctx.rand, 1, 3) : ctx.rand() < 0.12 ? 2 : 1 };
    if (item.modifiers.length > 0 && ctx.rand() < 0.22) line.modifierIds = [pick(ctx.rand, item.modifiers).id];
    lines.push(line);
  }
  return lines;
}

function guest(ctx: SeedContext): { name: string; phone: string } {
  return { name: egyptianName(ctx.rand), phone: egyptianMobile(ctx.rand) };
}

function guestAddress(ctx: SeedContext, branchKey: string): string {
  const zones: Record<string, string[]> = {
    nasr: ["مدينة نصر - الحي الثامن، شارع الطيران", "مدينة نصر - عباس العقاد، عمارات الضباط", "مدينة نصر - مكرم عبيد"],
    heliopolis: ["مصر الجديدة - شارع الثورة", "مصر الجديدة - ميدان تريومف", "مصر الجديدة - شارع النزهة"],
    maadi: ["المعادي - شارع 9", "المعادي - دجلة، شارع 213", "زهراء المعادي"],
  };
  return `${pick(ctx.rand, zones[branchKey])}، عمارة ${between(ctx.rand, 1, 90)}، الدور ${between(ctx.rand, 1, 10)}، شقة ${between(ctx.rand, 1, 25)}`;
}

function paymentKey(ctx: SeedContext): string {
  return weighted(ctx.rand, PAYMENT_METHODS.filter((m) => m.weight > 0), (m) => m.weight).key;
}

async function ratingTokenOf(ctx: SeedContext, orderId: string): Promise<string> {
  const [row] = await ctx.db.select({ token: orders.rating_token }).from(orders).where(eq(orders.id, orderId));
  return row.token;
}

async function orderTotal(ctx: SeedContext, orderId: string): Promise<number> {
  const [row] = await ctx.db.select({ total: orders.total }).from(orders).where(eq(orders.id, orderId));
  return Number(row.total);
}

export async function runBranchDay(ctx: SeedContext, day: string, spec: BranchSpec) {
  const branchId = ctx.branches[spec.key];
  const staff = staffAt(spec.key);
  const state: BranchDayState = {
    spec,
    branchId,
    cashierId: ctx.users[staff.find((s) => s.roles.includes("cashier"))!.key],
    managerId: ctx.users[staff.find((s) => s.roles.includes("branch_manager"))!.key],
    shiftId: "",
    cashierCashSales: 0,
    drawerOut: 0,
    driverCash: {},
    driverDelivered: {},
    driverShifts: {},
    attendance: [],
    completed: [],
    cashierCashOrders: [],
  };

  ctx.clock.set(cairoTime(day, 11, between(ctx.rand, 0, 20)));
  for (const member of staff) {
    if (member.roles.includes("branch_manager") && new Date(`${day}T12:00:00Z`).getUTCDay() === 2) continue;
    ctx.clock.advanceMinutes(between(ctx.rand, 1, 6));
    const shift = await handler(ctx, CheckInEmployeeHandler).execute({ userId: ctx.users[member.key], branchId });
    state.attendance.push({ userId: ctx.users[member.key], shiftId: shift.id });
    count(ctx, "employeeAttendance");
  }

  ctx.clock.set(cairoTime(day, 11, 40));
  const shift = await handler(ctx, OpenShiftHandler).execute({ branchId, userId: state.cashierId, openingCash: 1500, openingNotes: "عهدة الدرج 1500 جنيه" });
  state.shiftId = shift.id;
  ctx.clock.set(cairoTime(day, 11, 50));
  for (const driverId of ctx.drivers[spec.key]) {
    const driverShift = await handler(ctx, CheckInDriverHandler).execute({ driverId, branchId, checkedInBy: state.managerId });
    state.driverShifts[driverId] = driverShift.id;
  }

  const n = Math.round(between(ctx.rand, spec.dailyOrders[0], spec.dailyOrders[1]) * weekendFactor(day));
  const times = orderTimes(ctx, day, n);
  const drawerAt = new Set([Math.floor(n * 0.3), Math.floor(n * 0.7)]);
  for (const [i, at] of times.entries()) {
    ctx.clock.set(at);
    const channel = weighted<Channel>(ctx.rand, ["pos", "callcenter", "website", "talabat", "whatsapp"], (c) => ({ pos: 66, callcenter: 9, website: 9, talabat: 12, whatsapp: 4 })[c]);
    try {
      const placed = await placeOrder(ctx, day, state, channel);
      if (placed) await fulfil(ctx, day, state, placed, channel);
    } catch (err) {
      reportFailure(ctx, `order:${channel}`, err);
    }
    if (drawerAt.has(i)) await drawerEntry(ctx, state);
  }

  await maybePettyPurchase(ctx, day, state);
  await maybePaymentAdjustment(ctx, day, state);
  await followups(ctx, day, state);
  await closeBranchDay(ctx, day, state);
}

async function placeOrder(ctx: SeedContext, day: string, state: BranchDayState, channel: Channel): Promise<PlacedOrder | null> {
  const branchCustomers = ctx.customers.filter((c) => c.branchKey === state.spec.key);
  if (channel === "talabat") return placeTalabatOrder(ctx, state);
  if (channel === "whatsapp") return placeWhatsappOrder(ctx, day, state);
  if (channel === "website") return placeWebsiteOrder(ctx, day, state, pick(ctx.rand, branchCustomers));

  const dineInAllowed = state.spec.supportsDineIn !== false && channel === "pos";
  const orderType =
    channel === "callcenter" ? "delivery" : weighted(ctx.rand, ["dinein", "takeaway", "delivery"], (t) => (t === "dinein" ? (dineInAllowed ? 28 : 0) : t === "takeaway" ? 32 : 40));
  const known: CustomerRef | null = orderType !== "dinein" && ctx.rand() < 0.4 ? pick(ctx.rand, branchCustomers) : null;
  const walkIn = orderType === "dinein" ? null : known ? { name: known.name, phone: known.phone } : guest(ctx);
  const key = channel === "callcenter" ? (ctx.rand() < 0.8 ? "cash" : "instapay") : paymentKey(ctx);
  const createdBy = channel === "callcenter" ? ctx.users[ctx.rand() < 0.6 ? "callcenter" : "callcenter2"] : state.cashierId;
  const order = await handler(ctx, RegisterOrderHandler).execute({
    branchId: state.branchId,
    orderType,
    tableNumber: orderType === "dinein" ? `T${between(ctx.rand, 1, 14)}` : null,
    customerName: walkIn?.name ?? null,
    customerPhone: walkIn?.phone ?? null,
    addressDetails: orderType === "delivery" ? (known?.addressText ?? guestAddress(ctx, state.spec.key)) : null,
    items: basket(ctx, day, { online: false, combos: true }),
    discount: ctx.rand() < 0.05 ? 20 : 0,
    createdBy,
    paymentMethodId: ctx.paymentMethods[key].id,
    clientRequestId: randomUUID(),
    source: "pos",
    customerNotes: ctx.rand() < 0.1 ? pick(ctx.rand, ["من غير بصل", "زود الصوص", "الجرس بايظ كلمني أول ما توصل", "سبايسي لو سمحت"]) : null,
  });
  count(ctx, `orders:${channel}`);
  const placed: PlacedOrder = { id: order.id, total: Number(order.total), orderType, paymentKey: key, ratingToken: order.ratingToken, customerPhone: walkIn?.phone ?? null, ownDelivery: orderType === "delivery" };

  if (channel === "pos" && ctx.rand() < 0.03) {
    ctx.clock.advanceMinutes(between(ctx.rand, 2, 6));
    await handler(ctx, CancelOrderHandler).execute({ orderId: order.id, cancelledBy: state.managerId });
    await audit(ctx, state.managerId, "POST /orders/:id/cancel", "order", order.id, state.branchId, { reason: "العميل لغى الطلب" });
    count(ctx, "orders:cancelled");
    return null;
  }
  if (createdBy === state.cashierId && ctx.paymentMethods[key].kind === "cash") {
    state.cashierCashSales = round2(state.cashierCashSales + placed.total);
    state.cashierCashOrders.push(placed);
  }
  trackCardSale(ctx, state, placed);
  if (key === "instapay") instapayPayments.push({ orderId: order.id, amount: placed.total, branchId: state.branchId, day });
  return placed;
}

function trackCardSale(ctx: SeedContext, state: BranchDayState, placed: PlacedOrder) {
  const tally = (weeklyCardSales[state.spec.key] ??= {});
  tally[placed.paymentKey] = round2((tally[placed.paymentKey] ?? 0) + placed.total);
}

async function placeWebsiteOrder(ctx: SeedContext, day: string, state: BranchDayState, customer: CustomerRef): Promise<PlacedOrder> {
  const orderType = ctx.rand() < 0.85 ? "delivery" : "takeaway";
  const command = {
    customer: customer.customer,
    clientRequestId: randomUUID(),
    branchId: state.branchId,
    orderType,
    addressId: orderType === "delivery" ? customer.addressId : undefined,
    notes: ctx.rand() < 0.15 ? "رن الجرس مرتين" : undefined,
    items: basket(ctx, day, { online: true, combos: true }),
  };
  let result;
  if (ctx.rand() < 0.08) {
    try {
      result = await handler(ctx, PlaceOnlineOrderHandler).execute({ ...command, rewardId: pick(ctx.rand, ctx.rewards) });
      count(ctx, "loyaltyRedemptions");
    } catch {
      result = undefined;
    }
  }
  result ??= await handler(ctx, PlaceOnlineOrderHandler).execute({ ...command, clientRequestId: randomUUID() });
  count(ctx, "orders:website");
  return { id: result.orderId, total: Number(result.total), orderType, paymentKey: "cash", ratingToken: result.trackingToken, customerPhone: customer.phone, ownDelivery: orderType === "delivery" };
}

async function placeTalabatOrder(ctx: SeedContext, state: BranchDayState): Promise<PlacedOrder | null> {
  const talabatOrderId = `TB-${++talabatSequence}`;
  const brokenMapping = ctx.rand() < 0.03;
  const items = basket(ctx, "", { online: false, combos: false }).map((line) => {
    const [itemKey, ref] = Object.entries(ctx.menuItems).find(([, r]) => r.variants.some((v) => v.id === line.variantId))!;
    const label = ref.variants.find((v) => v.id === line.variantId)!.label;
    return { talabatItemId: talabatItemId(itemKey, label), quantity: line.quantity };
  });
  if (brokenMapping) items.push({ talabatItemId: "TLB-NEW-ITEM-NOT-MAPPED", quantity: 1 });
  const who = guest(ctx);
  const online = ctx.rand() < 0.7;
  const rawBody = JSON.stringify({
    talabatOrderId,
    status: "CREATED",
    talabatBranchId: state.spec.talabatBranchId,
    talabatPaymentCode: online ? "ONLINE" : "COD",
    customerName: who.name,
    customerPhone: who.phone,
    addressDetails: guestAddress(ctx, state.spec.key),
    items,
  });
  await handler(ctx, ReceiveTalabatWebhookHandler).execute({ rawBody, signatureHeader: `sha256=${createHmac("sha256", TALABAT_SEED_SECRET).update(rawBody).digest("hex")}` });
  count(ctx, "talabatWebhooks");
  const [row] = await ctx.db.select({ posOrderId: talabatOrders.pos_order_id }).from(talabatOrders).where(eq(talabatOrders.talabat_order_id, talabatOrderId));
  if (!row?.posOrderId) {
    count(ctx, "talabatMappingErrors");
    return null;
  }
  count(ctx, "orders:talabat");
  const placed: PlacedOrder = { id: row.posOrderId, total: await orderTotal(ctx, row.posOrderId), orderType: "delivery", paymentKey: online ? "talabatOnline" : "talabatCash", ratingToken: null, customerPhone: who.phone, ownDelivery: false };
  trackCardSale(ctx, state, placed);

  if (ctx.rand() < 0.04) {
    ctx.clock.advanceMinutes(4);
    const cancelBody = JSON.stringify({ talabatOrderId, status: "CANCELED", talabatBranchId: state.spec.talabatBranchId });
    await handler(ctx, ReceiveTalabatWebhookHandler).execute({ rawBody: cancelBody, signatureHeader: createHmac("sha256", TALABAT_SEED_SECRET).update(cancelBody).digest("hex") });
    count(ctx, "orders:talabatCancelled");
    return null;
  }
  return placed;
}

async function placeWhatsappOrder(ctx: SeedContext, day: string, state: BranchDayState): Promise<PlacedOrder | null> {
  const known = pick(ctx.rand, ctx.customers.filter((c) => c.branchKey === state.spec.key));
  const agent = ctx.users.callcenter;
  const { conversation } = await handler(ctx, ReceiveWhatsappMessageHandler).execute({
    channel: "whatsapp",
    phone: known.phone,
    customerName: known.name,
    body: pick(ctx.rand, ["مساء الخير، عايز أطلب أوردر توصيل", "السلام عليكم ممكن المنيو؟", "عايز بيتزا سجق كبير وبيبسي على العنوان المسجل"]),
    waMessageId: `wamid.SEED${String(waSequence++).padStart(8, "0")}`,
  });
  count(ctx, "whatsappMessages");
  const items = basket(ctx, day, { online: false, combos: false }).map((l) => ({ variantId: l.variantId!, quantity: l.quantity }));
  const pending = await handler(ctx, RegisterPendingOrderHandler).execute({ conversationId: conversation.id, orderType: "delivery", branchId: state.branchId, addressDetails: known.addressText, items });
  ctx.clock.advanceMinutes(3);
  if (ctx.rand() < 0.12) {
    await handler(ctx, RejectPendingOrderHandler).execute({ pendingOrderId: pending.id, reason: "العنوان خارج نطاق التوصيل", reviewedBy: agent });
    await handler(ctx, SendWhatsappReplyHandler).execute({ conversationId: conversation.id, body: "نعتذر جدًا، العنوان ده خارج نطاق التوصيل للفرع حاليًا 🙏", sentBy: agent });
    count(ctx, "whatsappRejected");
    return null;
  }
  const confirmed = await handler(ctx, ConfirmPendingOrderHandler).execute({ pendingOrderId: pending.id, paymentMethodId: ctx.paymentMethods.cash.id, reviewedBy: agent });
  await handler(ctx, SendWhatsappReplyHandler).execute({ conversationId: conversation.id, body: `تم تأكيد طلبك ✅ الإجمالي ${confirmed.total} جنيه، هيوصلك خلال 45 دقيقة`, sentBy: agent });
  count(ctx, "orders:whatsapp");
  const orderId = confirmed.confirmedOrderId!;
  return { id: orderId, total: await orderTotal(ctx, orderId), orderType: "delivery", paymentKey: "cash", ratingToken: null, customerPhone: known.phone, ownDelivery: true };
}

async function fulfil(ctx: SeedContext, day: string, state: BranchDayState, placed: PlacedOrder, channel: Channel) {
  const kitchen = handler(ctx, AdvanceKitchenStatusHandler);
  const status = handler(ctx, UpdateOrderStatusHandler);
  for (const [step, minutes] of [["ACCEPTED", 2], ["PREPARING", 3], ["READY", between(ctx.rand, 9, 16)]] as const) {
    ctx.clock.advanceMinutes(minutes);
    await kitchen.execute({ orderId: placed.id, kitchenStatus: step });
  }

  if (placed.orderType === "delivery") {
    ctx.clock.advanceMinutes(2);
    if (placed.ownDelivery) {
      const driverId = pick(ctx.rand, ctx.drivers[state.spec.key]);
      const assignment = await handler(ctx, AssignDriverHandler).execute({ orderId: placed.id, driverId, assignedBy: state.cashierId });
      await handler(ctx, UpdateDeliveryStatusHandler).execute({ assignmentId: assignment.id, status: "OUT_FOR_DELIVERY" });
      await status.execute({ orderId: placed.id, status: "out_for_delivery" });
      ctx.clock.advanceMinutes(between(ctx.rand, 15, 35));
      const cash = ctx.paymentMethods[placed.paymentKey].kind === "cash";
      await handler(ctx, UpdateDeliveryStatusHandler).execute({ assignmentId: assignment.id, status: "DELIVERED", collectedAmount: cash ? placed.total : null });
      state.driverDelivered[driverId] = (state.driverDelivered[driverId] ?? 0) + 1;
      if (cash) state.driverCash[driverId] = round2((state.driverCash[driverId] ?? 0) + placed.total);
      count(ctx, "deliveries");
    } else {
      await status.execute({ orderId: placed.id, status: "out_for_delivery" });
      ctx.clock.advanceMinutes(between(ctx.rand, 20, 35));
    }
  } else {
    ctx.clock.advanceMinutes(placed.orderType === "dinein" ? between(ctx.rand, 20, 45) : between(ctx.rand, 1, 5));
  }
  await status.execute({ orderId: placed.id, status: "completed" });
  state.completed.push(placed);
  count(ctx, "orders:completed");

  if (ctx.rand() < 0.13 && channel !== "talabat") {
    const stars = weighted(ctx.rand, [5, 4, 3, 2, 1], (s) => [52, 28, 11, 6, 3][5 - s]);
    await handler(ctx, SubmitOrderRatingHandler).execute({
      orderId: placed.id,
      token: placed.ratingToken ?? (await ratingTokenOf(ctx, placed.id)),
      stars,
      comment: ctx.rand() < 0.6 ? pick(ctx.rand, RATING_COMMENTS[stars]) : null,
    });
    count(ctx, "ratings");
  }
}

async function drawerEntry(ctx: SeedContext, state: BranchDayState) {
  const purchase = ctx.rand() < 0.3;
  const [label, min, max] = purchase
    ? pick(ctx.rand, [["عيش وخضار من السوق", 150, 420], ["ثلج", 60, 120]] as const)
    : pick(ctx.rand, [["مواصلات طيار", 40, 90], ["منظفات وأكياس زبالة", 70, 180], ["كارت شحن موبايل الفرع", 50, 100], ["إكرامية عامل نظافة العمارة", 50, 100]] as const);
  const amount = between(ctx.rand, min, max);
  await handler(ctx, RegisterCashDrawerEntryHandler).execute({ shiftId: state.shiftId, entryType: purchase ? "PURCHASE" : "EXPENSE", amount, label, createdBy: state.cashierId });
  state.drawerOut += amount;
  count(ctx, "cashDrawerEntries");
}

async function maybePettyPurchase(ctx: SeedContext, day: string, state: BranchDayState) {
  if (ctx.rand() > 0.3) return;
  ctx.clock.set(cairoTime(day, 16, between(ctx.rand, 0, 50)));
  const items = pick(ctx.rand, [["tomato", "onion", "pepper"], ["mushroom", "orange"], ["onion", "pepper", "orange"]]).map((key) => {
    const spec = INVENTORY.find((i) => i.key === key)!;
    return { inventoryItemId: ctx.inventory[key], quantity: between(ctx.rand, 5, 15), unitPrice: round2(spec.unitCost * (0.95 + ctx.rand() * 0.12)) };
  });
  const base = { branchId: state.branchId, businessDate: new Date(`${day}T00:00:00Z`), category: "خضار وفاكهة", supplierId: ctx.suppliers.veg, items, notes: "شراء نقدي من سوق العبور" };
  if (ctx.rand() < 0.5) {
    await handler(ctx, RegisterPurchaseHandler).execute({ ...base, supplierDocumentNumber: `VEG-${day.replace(/-/g, "")}-${state.spec.key}`, initialStatus: "CONFIRMED", createdBy: state.managerId });
  } else {
    const pending = await handler(ctx, RegisterPurchaseHandler).execute({ ...base, initialStatus: "PENDING", createdBy: state.cashierId });
    ctx.clock.advanceMinutes(40);
    if (ctx.rand() < 0.1) await handler(ctx, RejectPurchaseHandler).execute({ purchaseId: pending.id, reviewedBy: state.managerId, reason: "السعر أعلى من سعر المورد المعتمد" });
    else await handler(ctx, ConfirmPurchaseHandler).execute({ purchaseId: pending.id, reviewedBy: state.managerId });
  }
  count(ctx, "pettyPurchases");
}

async function maybePaymentAdjustment(ctx: SeedContext, day: string, state: BranchDayState) {
  if (ctx.rand() > 0.22 || state.cashierCashOrders.length === 0) return;
  const target = pick(ctx.rand, state.cashierCashOrders);
  const [payment] = await ctx.db.select({ id: payments.id }).from(payments).where(eq(payments.order_id, target.id));
  if (!payment) return;
  ctx.clock.set(cairoTime(day, 23, 5));
  const request = await handler(ctx, RequestPaymentAdjustmentHandler).execute({
    paymentId: payment.id,
    requestedBy: state.cashierId,
    reason: "العميل دفع بالفيزا والطلب اتسجل كاش بالغلط",
    proposedPaymentMethodId: ctx.paymentMethods.visa.id,
    proposedAmount: target.total,
  });
  ctx.clock.advanceMinutes(8);
  const high = target.total >= 500;
  await handler(ctx, ApprovePaymentAdjustmentHandler).execute({ requestId: request.id, decidedBy: high ? ctx.users.opsAdmin : state.managerId, hasHighApproval: high, hasTalabatOverride: false });
  state.cashierCashSales = round2(state.cashierCashSales - target.total);
  const tally = (weeklyCardSales[state.spec.key] ??= {});
  tally.cash = round2((tally.cash ?? 0) - target.total);
  tally.visa = round2((tally.visa ?? 0) + target.total);
  count(ctx, "paymentAdjustments");
}

async function followups(ctx: SeedContext, day: string, state: BranchDayState) {
  const candidates = state.completed.filter((o) => o.orderType === "delivery" && o.customerPhone);
  for (const order of candidates) {
    if (ctx.rand() > 0.15) continue;
    ctx.clock.set(cairoTime(day, 23, between(ctx.rand, 10, 25)));
    const callResult = weighted(ctx.rand, ["answered", "no_answer", "no_answer_after_3_tries"], (r) => (r === "answered" ? 75 : r === "no_answer" ? 18 : 7));
    const hasComplaint = callResult === "answered" && ctx.rand() < 0.12;
    const category = pick(ctx.rand, ["late_order", "wrong_item", "quality", "other"]);
    const { complaint } = await handler(ctx, RecordFollowupHandler).execute({
      orderId: order.id,
      branchId: state.branchId,
      customerPhone: order.customerPhone!,
      callResult,
      satisfactionRating: callResult === "answered" ? (hasComplaint ? "bad" : weighted(ctx.rand, ["excellent", "good", "average"], (s) => (s === "excellent" ? 55 : s === "good" ? 35 : 10))) : null,
      notes: callResult === "answered" ? null : "هنعاود الاتصال بكرة",
      hasComplaint,
      complaint: hasComplaint ? { category, description: pick(ctx.rand, COMPLAINT_TEXTS[category]), status: "open" } : undefined,
      actingUserId: ctx.users.callcenter,
    });
    count(ctx, "followups");
    if (complaint) openComplaints.push({ id: complaint.id, openedOn: day });
  }

  if (ctx.rand() < 0.08) {
    const known = pick(ctx.rand, ctx.customers.filter((c) => c.branchKey === state.spec.key));
    const category = pick(ctx.rand, ["late_order", "quality"]);
    const { conversation } = await handler(ctx, ReceiveWhatsappMessageHandler).execute({
      channel: pick(ctx.rand, ["whatsapp", "messenger", "instagram"]),
      phone: known.phone,
      customerName: known.name,
      body: pick(ctx.rand, COMPLAINT_TEXTS[category]),
      waMessageId: `wamid.SEED${String(waSequence++).padStart(8, "0")}`,
    });
    const complaint = await handler(ctx, RegisterComplaintFromConversationHandler).execute({ conversationId: conversation.id, category, description: "شكوى واردة على الرسائل", branchId: state.branchId, createdBy: ctx.users.callcenter2 });
    await handler(ctx, SendWhatsappReplyHandler).execute({ conversationId: conversation.id, body: "نعتذر جدًا عن التجربة دي، مدير الفرع هيتواصل مع حضرتك خلال ساعة", sentBy: ctx.users.callcenter2 });
    openComplaints.push({ id: complaint.id, openedOn: day });
    count(ctx, "complaints:messaging");
  }
}

export async function resolveComplaints(ctx: SeedContext, day: string) {
  for (const complaint of [...openComplaints]) {
    if (complaint.openedOn >= day) continue;
    ctx.clock.set(cairoTime(day, 13, between(ctx.rand, 0, 50)));
    const resolved = ctx.rand() < 0.8;
    await handler(ctx, UpdateComplaintStatusHandler).execute({
      complaintId: complaint.id,
      status: resolved ? "resolved" : "in_progress",
      resolutionNotes: resolved ? pick(ctx.rand, ["تم الاعتذار وإرسال أوردر بديل مجانًا", "تم عمل خصم 30% على الأوردر الجاي", "تم التحقيق مع الطيار ولفت نظره"]) : "جاري المتابعة مع مدير الفرع",
      actingUserId: ctx.users.callcenter,
    });
    if (resolved) openComplaints.splice(openComplaints.indexOf(complaint), 1);
    count(ctx, "complaintUpdates");
  }
}

async function closeBranchDay(ctx: SeedContext, day: string, state: BranchDayState) {
  ctx.clock.set(cairoTime(day, 23, 35));
  for (const driverId of ctx.drivers[state.spec.key]) {
    if ((state.driverDelivered[driverId] ?? 0) > 0) {
      const expected = state.driverCash[driverId] ?? 0;
      const short = ctx.rand() < 0.1 ? between(ctx.rand, 35, 90) : 0;
      const settlement = await handler(ctx, RegisterDriverSettlementHandler).execute({
        driverId,
        branchId: state.branchId,
        actualHandover: round2(Math.max(0, expected - short)),
        notes: short ? "عجز في تسليم الطيار" : null,
        settledBy: state.cashierId,
      });
      count(ctx, "driverSettlements");
      if (settlement.varianceStatus === "PENDING_REVIEW") {
        await handler(ctx, ReviewDriverSettlementHandler).execute({ settlementId: settlement.id, decision: "acknowledge", notes: "هيتخصم من مستحقات الطيار", reviewerId: state.managerId });
      }
    }
    ctx.clock.advanceMinutes(1);
    await handler(ctx, CheckOutDriverHandler).execute({ shiftId: state.driverShifts[driverId], checkedOutBy: state.managerId });
  }

  ctx.clock.set(cairoTime(day, 23, 45));
  const expected = round2(1500 + state.cashierCashSales - state.drawerOut);
  const roll = ctx.rand();
  const variance = roll < 0.8 ? 0 : roll < 0.92 ? between(ctx.rand, -15, 15) : -between(ctx.rand, 40, 120);
  const closed = await handler(ctx, CloseShiftHandler).execute({
    shiftId: state.shiftId,
    actualCash: round2(expected + variance),
    closingNotes: variance < -20 ? "عجز في الدرج - تم إبلاغ المدير" : null,
    closedBy: state.cashierId,
  });
  count(ctx, "shifts");
  if (closed.status === "PENDING_REVIEW") {
    await handler(ctx, ReviewShiftVarianceHandler).execute({ shiftId: closed.id, decision: "approve", notes: "تمت مراجعة الكاميرات والعجز على الكاشير", reviewerId: state.managerId });
  }
  await audit(ctx, state.cashierId, "POST /shifts/:id/close", "cashier_shift", closed.id, state.branchId, { variance });

  for (const entry of state.attendance) {
    ctx.clock.advanceMinutes(1);
    await handler(ctx, CheckOutEmployeeHandler).execute({ userId: entry.userId, shiftId: entry.shiftId });
  }

  const pending = await ctx.db.select({ id: printJobs.id }).from(printJobs).where(and(eq(printJobs.branch_id, state.branchId), eq(printJobs.status, "PENDING")));
  for (const job of pending) {
    await handler(ctx, ClaimPrintJobHandler).execute({ printJobId: job.id });
    await handler(ctx, MarkPrintJobPrintedHandler).execute({ printJobId: job.id });
  }
  count(ctx, "printJobs", pending.length);

  ctx.clock.set(cairoTime(day, 23, 57));
  const dayClose = await handler(ctx, CloseBranchDayHandler).execute({ branchId: state.branchId, closedBy: state.managerId, businessDate: day, managerNotes: "تم التقفيل ومطابقة الدرج والطيارين" });
  await audit(ctx, state.managerId, "POST /branch-days/close", "branch_day", dayClose.id, state.branchId, { businessDate: day });
  count(ctx, "branchDays");
}

export async function registerInstapayStatements(ctx: SeedContext, day: string) {
  const record = handler(ctx, RegisterReconciliationRecordHandler);
  for (const payment of instapayPayments.filter((p) => p.day === day)) {
    if (ctx.rand() > 0.85) continue;
    await record.execute({
      branchId: payment.branchId,
      source: "instapay",
      externalReference: `IPN${Math.floor(ctx.rand() * 1e10)}`,
      externalAmount: payment.amount,
      externalDate: cairoTime(day, 23, 0),
      notes: null,
      enteredBy: ctx.users.accountant,
    });
    count(ctx, "reconciliationRecords");
  }
}

export const RETAIL_BRANCHES = BRANCHES.filter((b) => !b.isCentralKitchen);
