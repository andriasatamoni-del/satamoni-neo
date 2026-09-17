// قراءة الرصيد اللحظي لخزينة (أو أكتر) من journal_entry_lines/journal_entries مباشرة (Accounting
// context تاني) - نفس فلسفة ShiftFinancialsReaderPort بالظبط: Treasury (هنا) مالوش رصيد مخزّن، أي
// قيد مش DRAFT (يعني POSTED أو REVERSED) بيتحسب - قيد REVERSED فعليًا لسه جزء حقيقي من الدفتر، وقيد
// العكس الجديد (POSTED) هو اللي بيلغي أثره؛ استبعاد REVERSED كان بيرحّل التصحيح مرتين بدل مرة
export interface TreasuryBalanceReaderPort {
  getBalances(accountIds: string[]): Promise<Map<string, number>>;
}

export const TREASURY_BALANCE_READER = Symbol("TREASURY_BALANCE_READER");
