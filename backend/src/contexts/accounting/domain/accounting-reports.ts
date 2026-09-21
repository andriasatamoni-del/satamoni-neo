import type { AccountType } from "./account.aggregate";

// ميزان المراجعة/دفتر الأستاذ/قائمة الدخل كلهم بيعتمدوا على نفس قاعدة "الجانب الطبيعي" للحساب:
// الالتزامات/حقوق الملكية/الإيرادات جانبها الطبيعي دائن (الرصيد = دائن - مدين)، والباقي (أصول/تكلفة
// المبيعات/مصروفات) جانبها الطبيعي مدين (الرصيد = مدين - دائن) - قاعدة محاسبية قياسية، مفيش تخصيص هنا
const CREDIT_NORMAL_TYPES: ReadonlySet<AccountType> = new Set(["LIABILITY", "EQUITY", "REVENUE"]);

export function isCreditNormalAccount(accountType: AccountType): boolean {
  return CREDIT_NORMAL_TYPES.has(accountType);
}

export function computeAccountBalance(accountType: AccountType, totalDebit: number, totalCredit: number): number {
  return isCreditNormalAccount(accountType) ? totalCredit - totalDebit : totalDebit - totalCredit;
}
