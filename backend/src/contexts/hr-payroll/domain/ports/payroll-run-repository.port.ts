import type { PayrollRun } from "../payroll-run.aggregate";

export interface PayrollRunRepositoryPort {
  save(run: PayrollRun): Promise<void>;
  findById(id: string): Promise<PayrollRun | null>;
  findByLegacyPayrollRunId(legacyId: number): Promise<PayrollRun | null>;
  // بيتحقق إن مفيش قائمة فعّالة (مش CANCELLED) للشهر ده - نفس التحقق اللي الـpartial unique index
  // بيفرضه على مستوى القاعدة، هنا للتحقق المبكر/رسالة خطأ واضحة قبل ما نوصل للـDB أصلًا
  findActiveByPeriod(year: number, month: number): Promise<PayrollRun | null>;
  list(filter?: { status?: string }): Promise<PayrollRun[]>;
  deleteDraft(id: string): Promise<void>;
}

export const PAYROLL_RUN_REPOSITORY = Symbol("PAYROLL_RUN_REPOSITORY");
