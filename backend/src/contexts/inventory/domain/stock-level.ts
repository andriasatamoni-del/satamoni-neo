export type StockLevelStatus = "OUT" | "NEEDS_REORDER" | "NORMAL";

// نفس قاعدة الريبو القديم بالظبط: رصيد صفر أو أقل = OUT (بغض النظر عن وجود حد إعادة طلب)، وإلا لو فيه
// حد إعادة طلب مضبوط والرصيد وصله أو تحته = NEEDS_REORDER. صنف من غير حد إعادة طلب مضبوط يفضل NORMAL
// طول ما رصيده موجب - مفيش تنبيه من غير ما حد يحدد الحد بنفسه
export function classifyStockLevel(quantity: number, reorderPoint: number | null): StockLevelStatus {
  if (quantity <= 0) return "OUT";
  if (reorderPoint !== null && quantity <= reorderPoint) return "NEEDS_REORDER";
  return "NORMAL";
}
