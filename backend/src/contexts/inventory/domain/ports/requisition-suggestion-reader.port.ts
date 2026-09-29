export interface ThresholdItemRow {
  inventoryItemId: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number | null;
  maxStock: number | null;
}

// قراءة بس (read model) - بيجمع كل المدخلات اللي محرك الاقتراح محتاجها بأقل عدد استعلامات ممكن
export interface RequisitionSuggestionReaderPort {
  // الأصناف اللي ليها أي حد مخزون مضبوط للفرع ده (reorder/min/max) - من غيرها مفيش أساس للاقتراح
  listThresholdItems(branchId: string): Promise<ThresholdItemRow[]>;
  // استهلاك كل صنف في كل تاريخ من التواريخ المطلوبة (بتاريخ القاهرة) - itemId -> (date -> qty)
  consumptionByDate(branchId: string, dates: string[], movementTypes: readonly string[]): Promise<Map<string, Map<string, number>>>;
  // كمية طلبات التحويل للفرع ده اللي لسه ماتبعتتش (SUBMITTED/APPROVED)
  pendingPipelineQuantities(branchId: string): Promise<Map<string, number>>;
  // كمية طلبات التحويل للفرع ده اللي اتبعتت ولسه ماوصلتش (DISPATCHED)
  inTransitQuantities(branchId: string): Promise<Map<string, number>>;
}

export const REQUISITION_SUGGESTION_READER = Symbol("REQUISITION_SUGGESTION_READER");
