// رصيد المورد الحالي (اللي لسه واجبه ليه) - بيتحسب من journal_entry_lines المرتبطة بيه مباشرة
// (reference_type='supplier') مش من عمود مخزّن، نفس فلسفة TreasuryBalanceReaderPort بالظبط: أي قيد
// مش DRAFT (يعني POSTED أو REVERSED) بيتحسب - استبعاد REVERSED كان بيرحّل تصحيح الإلغاء مرتين بدل مرة
export interface SupplierBalanceReaderPort {
  getBalance(supplierId: string): Promise<number>;
}

export const SUPPLIER_BALANCE_READER = Symbol("SUPPLIER_BALANCE_READER");
