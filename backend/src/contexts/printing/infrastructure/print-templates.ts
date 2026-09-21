// دوال بناء محتوى الطباعة (HTML كامل جاهز لورقة حرارية) - كل دالة pure function بترجع نص HTML بس، من
// غير أي اتصال بقاعدة بيانات أو شبكة (نفس فلسفة db/print-templates.js في الريبو القديم بالظبط). المحتوى
// بيتسجل في print_jobs.content_html وقت إنشاء الطلب/الحدث، مش وقت الطباعة الفعلية، عشان يفضل ثابت
// تاريخيًا حتى لو الطلب/المنيو اتغيّر بعد كده.

export interface PrintOrderSummary {
  orderId: string;
  branchLabel: string;
  orderTypeLabel: string;
  createdAt: Date;
  paymentMethodLabel?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  tableNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  addressDetails?: string | null;
}

export interface PrintItemLine {
  name: string;
  variantLabel?: string | null;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
}

function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}

function money(n: number | undefined): string {
  return Number(n || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleString("ar-EG");
}

function page(title: string, bodyHtml: string, paperWidthMm = 80): string {
  const contentWidthMm = Math.max(50, paperWidthMm - 12);
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${esc(title)}</title>
<style>
  @page { size: ${paperWidthMm}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; width: ${contentWidthMm}mm; margin: 0 auto; padding: 3mm 0; color: #000; }
  h1 { font-size: 15px; margin: 0 0 2mm; text-align: center; }
  h2 { font-size: 13px; margin: 0 0 1mm; }
  .center { text-align: center; }
  .meta { font-size: 10px; margin-bottom: 1mm; word-wrap: break-word; }
  .sep { border-top: 1px dashed #000; margin: 2mm 0; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td, th { padding: 1mm 0; font-size: 12px; text-align: right; vertical-align: top; word-wrap: break-word; }
  td.qty, th.qty { width: 16mm; white-space: nowrap; }
  td.price, th.price { width: 18mm; white-space: nowrap; }
  .mods { font-size: 10px; padding-right: 2mm; }
  .totals td { border-bottom: none; font-size: 13px; }
  .totals tr.grand td { font-weight: bold; font-size: 15px; border-top: 1px solid #000; padding-top: 1mm; }
  .bold { font-weight: bold; }
</style></head><body>${bodyHtml}</body></html>`;
}

function header(order: PrintOrderSummary, extraLines: string[] = []): string {
  const lines = [
    `<div class="meta center">${esc(order.branchLabel)}</div>`,
    `<div class="meta center">${esc(order.orderTypeLabel)} - طلب #${esc(order.orderId)}</div>`,
    `<div class="meta center">${fmtDate(order.createdAt)}</div>`,
    ...extraLines,
    `<div class="sep"></div>`,
  ];
  return lines.join("\n");
}

function itemsTable(items: PrintItemLine[], { withPrices }: { withPrices: boolean }): string {
  const rows = items
    .map(
      (it) => `<tr>
        <td class="qty">×${it.quantity}</td>
        <td>${esc(it.name)}${it.variantLabel ? ` - ${esc(it.variantLabel)}` : ""}</td>
        ${withPrices ? `<td class="price">${money(it.lineTotal)}</td>` : ""}
      </tr>`
    )
    .join("");
  return `<table><tbody>${rows}</tbody></table>`;
}

function totalsTable(order: PrintOrderSummary): string {
  return `<div class="sep"></div><table class="totals"><tbody>
    <tr><td>الإجمالي الفرعي</td><td class="val price">${money(order.subtotal)}</td></tr>
    ${order.discount ? `<tr><td>الخصم</td><td class="val price">-${money(order.discount)}</td></tr>` : ""}
    <tr class="grand"><td>الإجمالي</td><td class="val price">${money(order.total)}</td></tr>
    ${order.paymentMethodLabel ? `<tr><td>طريقة الدفع</td><td class="val">${esc(order.paymentMethodLabel)}</td></tr>` : ""}
  </tbody></table>`;
}

export function buildCustomerReceipt(input: { order: PrintOrderSummary; items: PrintItemLine[]; paperWidthMm?: number }): string {
  const body = `<h1>إيصال العميل</h1>${header(input.order)}${itemsTable(input.items, { withPrices: true })}${totalsTable(input.order)}`;
  return page("إيصال العميل", body, input.paperWidthMm);
}

export function buildKitchenTicket(input: {
  order: PrintOrderSummary;
  items: PrintItemLine[];
  stationName: string;
  paperWidthMm?: number;
}): string {
  const body = `<h1>تذكرة مطبخ - ${esc(input.stationName)}</h1>${header(input.order, [
    input.order.tableNumber ? `<div class="meta bold center">طاولة ${esc(input.order.tableNumber)}</div>` : "",
  ])}${itemsTable(input.items, { withPrices: false })}`;
  return page(`تذكرة مطبخ - ${input.stationName}`, body, input.paperWidthMm);
}

export function buildKitchenSummary(input: { order: PrintOrderSummary; items: PrintItemLine[]; paperWidthMm?: number }): string {
  const body = `<h1>ملخص المطبخ</h1>${header(input.order)}${itemsTable(input.items, { withPrices: false })}`;
  return page("ملخص المطبخ", body, input.paperWidthMm);
}

export function buildDeliverySummary(input: { order: PrintOrderSummary; items: PrintItemLine[]; paperWidthMm?: number }): string {
  const body = `<h1>ملخص دليفري</h1>${header(input.order, [
    input.order.customerName ? `<div class="meta">${esc(input.order.customerName)} - ${esc(input.order.customerPhone)}</div>` : "",
    input.order.addressDetails ? `<div class="meta">${esc(input.order.addressDetails)}</div>` : "",
  ])}${itemsTable(input.items, { withPrices: false })}`;
  return page("ملخص دليفري", body, input.paperWidthMm);
}

export function buildDeliveryFinalReceipt(input: {
  order: PrintOrderSummary;
  items: PrintItemLine[];
  paperWidthMm?: number;
}): string {
  const body = `<h1>إيصال تسليم دليفري</h1>${header(input.order, [
    input.order.customerName ? `<div class="meta">${esc(input.order.customerName)} - ${esc(input.order.customerPhone)}</div>` : "",
  ])}${itemsTable(input.items, { withPrices: true })}${totalsTable(input.order)}`;
  return page("إيصال تسليم دليفري", body, input.paperWidthMm);
}

export function buildDineInBill(input: { order: PrintOrderSummary; items: PrintItemLine[]; paperWidthMm?: number }): string {
  const body = `<h1>فاتورة</h1>${header(input.order, [
    input.order.tableNumber ? `<div class="meta bold center">طاولة ${esc(input.order.tableNumber)}</div>` : "",
  ])}${itemsTable(input.items, { withPrices: true })}${totalsTable(input.order)}`;
  return page("فاتورة", body, input.paperWidthMm);
}

export function buildTestPrint(input: { printerName: string; branchLabel: string; paperWidthMm?: number }): string {
  const body = `<h1>طباعة تجريبية</h1>
    <div class="meta center">${esc(input.branchLabel)}</div>
    <div class="meta center">${esc(input.printerName)}</div>
    <div class="sep"></div>
    <div class="center">لو قدرت تقرا السطر ده، الطابعة شغالة صح ✓</div>
    <div class="meta center">${fmtDate(new Date())}</div>`;
  return page("طباعة تجريبية", body, input.paperWidthMm);
}
