import { randomUUID } from "node:crypto";
import { ExpenseCategoryNameRequiredError } from "./errors";

export interface ExpenseCategoryProps {
  name: string;
  isActive: boolean;
  alertThreshold: number | null;
  accountId: string | null;
  createdAt: Date;
}

// ExpenseCategory - نفس مفهوم expense_categories في الريبو القديم: بند ثابت من ليستة مقفولة (أدمن بس
// بيضيف/يعدّل)، مش نص حر وقت تسجيل المصروف - عشان التقارير تفضل قابلة للتجميع الحقيقي. accountId
// اختياري (الحساب في شجرة الحسابات اللي المصروف بيترحّل عليه) - لو مش محدد، بيترحّل على حساب "مصروفات
// تشغيل أخرى" الافتراضي (6900) وقت الترحيل (راجع review-expense.handler.ts). alertThreshold استرشادي
// بس للتقارير (تنبيه لو مصروف من البند ده تجاوزه) - مش قيد فعلي هنا
export class ExpenseCategory {
  private constructor(
    public readonly id: string,
    private props: ExpenseCategoryProps
  ) {}

  static register(input: { name: string; accountId?: string | null; alertThreshold?: number | null }): ExpenseCategory {
    const name = input.name.trim();
    if (!name) throw new ExpenseCategoryNameRequiredError();

    return new ExpenseCategory(randomUUID(), {
      name,
      isActive: true,
      alertThreshold: input.alertThreshold ?? null,
      accountId: input.accountId ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: ExpenseCategoryProps): ExpenseCategory {
    return new ExpenseCategory(id, props);
  }

  update(input: { name?: string; isActive?: boolean; alertThreshold?: number | null; accountId?: string | null }): void {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ExpenseCategoryNameRequiredError();
      this.props.name = name;
    }
    if (input.isActive !== undefined) this.props.isActive = input.isActive;
    if (input.alertThreshold !== undefined) this.props.alertThreshold = input.alertThreshold;
    if (input.accountId !== undefined) this.props.accountId = input.accountId;
  }

  get name(): string { return this.props.name; }
  get isActive(): boolean { return this.props.isActive; }
  get alertThreshold(): number | null { return this.props.alertThreshold; }
  get accountId(): string | null { return this.props.accountId; }
  get createdAt(): Date { return this.props.createdAt; }
}
