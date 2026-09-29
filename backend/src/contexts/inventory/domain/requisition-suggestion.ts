// REQ-1: محرك اقتراح الطلبية - نسخة من db/requisition-suggestion.js في الريبو القديم (Procurement v2
// STEP E + تصليحات STEP L-audit). الفكرة: الكمية المقترحة مبنية على استهلاك فعلي تاريخي لنفس يوم الأسبوع
// (الخميس/الجمعة بيختلفوا عن باقي الأيام)، مش "max_stock - الرصيد" البسيطة. الكمية اللي في الطريق فعلًا
// (طلبات تحويل لسه ماوصلتش) بتتخصم عشان مانطلبش نفس الكمية مرتين.
//
// قرار نطاق موثّق: الريبو القديم بيحسب الاستهلاك من SALE/PRODUCTION_OUT/WASTE/DAMAGE/EXPIRY. في neo
// الهالك اليدوي بيتسجّل كـCONSUMPTION بسبب (مفيش نوع حركة WASTE منفصل)، فأنواع الاستهلاك هنا
// CONSUMPTION + PRODUCTION_OUT بس - نفس التغطية الفعلية. شطب الدفعات (BATCH-1) مش بيعمل حركة مخزون أصلًا
// فمش داخل في الحساب (نفس سلوك باقي تقارير المخزون).

export const CONSUMPTION_MOVEMENT_TYPES = ["CONSUMPTION", "PRODUCTION_OUT"] as const;
export const DEFAULT_LOOKBACK_WEEKS = 8;
export const MAX_COVERAGE_DAYS = 14;

export interface RequisitionItemInput {
  inventoryItemId: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number | null;
  maxStock: number | null;
  // استهلاك الصنف لكل يوم (YYYY-MM-DD) في أيام المقارنة التاريخية بس
  consumptionByDate: ReadonlyMap<string, number>;
  pendingPipelineQuantity: number;
  inTransitQuantity: number;
}

export interface RequisitionSuggestionLine {
  inventoryItemId: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  maxStock: number | null;
  avgWeekdayConsumption: number;
  expectedConsumption: number;
  coverageDays: number;
  target: number;
  pendingPipelineQuantity: number;
  inTransitQuantity: number;
  suggestedQuantity: number;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// أيام نافذة التغطية: من targetDate (شامل) لحد nextReplenishmentDate (مش شامل). من غيره = يوم واحد
export function coverageWindow(targetDate: string, nextReplenishmentDate: string | null): string[] {
  if (!nextReplenishmentDate || nextReplenishmentDate <= targetDate) return [targetDate];
  const days: string[] = [];
  for (let d = targetDate; d < nextReplenishmentDate && days.length < MAX_COVERAGE_DAYS; d = addDays(d, 1)) days.push(d);
  return days;
}

// نفس يوم الأسبوع في آخر lookbackWeeks أسبوع (طرح مضاعفات 7 أيام)
export function pastOccurrencesOfWeekday(date: string, lookbackWeeks: number): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= lookbackWeeks; i++) dates.push(addDays(date, -7 * i));
  return dates;
}

// كل التواريخ التاريخية اللي محتاجين استهلاكها عشان نحسب النافذة كلها - استعلام واحد بدل استعلام لكل يوم
export function lookbackDatesForWindow(window: string[], lookbackWeeks: number): string[] {
  const all = new Set<string>();
  for (const day of window) for (const d of pastOccurrencesOfWeekday(day, lookbackWeeks)) all.add(d);
  return [...all].sort();
}

function averageForDay(day: string, consumptionByDate: ReadonlyMap<string, number>, lookbackWeeks: number): number {
  const total = pastOccurrencesOfWeekday(day, lookbackWeeks).reduce((sum, d) => sum + (consumptionByDate.get(d) ?? 0), 0);
  return total / lookbackWeeks;
}

export function computeRequisitionLine(
  item: RequisitionItemInput,
  window: string[],
  lookbackWeeks: number
): RequisitionSuggestionLine {
  const avgWeekdayConsumption = averageForDay(window[0], item.consumptionByDate, lookbackWeeks);
  const expectedConsumption = window.reduce((sum, day) => sum + averageForDay(day, item.consumptionByDate, lookbackWeeks), 0);
  const minStock = item.minStock ?? 0;

  let target = expectedConsumption + minStock;
  if (item.maxStock != null) target = Math.min(target, item.maxStock);
  const availableCoverage = item.currentStock + item.pendingPipelineQuantity + item.inTransitQuantity;
  const suggestedQuantity = Math.max(0, target - availableCoverage);

  return {
    inventoryItemId: item.inventoryItemId,
    name: item.name,
    unit: item.unit,
    currentStock: item.currentStock,
    minStock,
    maxStock: item.maxStock,
    avgWeekdayConsumption: round(avgWeekdayConsumption),
    expectedConsumption: round(expectedConsumption),
    coverageDays: window.length,
    target: round(target),
    pendingPipelineQuantity: item.pendingPipelineQuantity,
    inTransitQuantity: item.inTransitQuantity,
    suggestedQuantity: round(suggestedQuantity),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
