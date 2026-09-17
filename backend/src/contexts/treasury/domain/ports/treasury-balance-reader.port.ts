// قراءة الرصيد اللحظي لخزينة (أو أكتر) من journal_entry_lines/journal_entries مباشرة (Accounting
// context تاني) - نفس فلسفة ShiftFinancialsReaderPort بالظبط: Treasury (هنا) مالوش رصيد مخزّن، القيود
// POSTED بس هي مصدر الحقيقة (REVERSED مستبعد لأن قيد عكسي جديد POSTED بيمثّل أثره الصافي بالفعل)
export interface TreasuryBalanceReaderPort {
  getBalances(accountIds: string[]): Promise<Map<string, number>>;
}

export const TREASURY_BALANCE_READER = Symbol("TREASURY_BALANCE_READER");
