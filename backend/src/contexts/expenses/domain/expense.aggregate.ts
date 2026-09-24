import { randomUUID } from "node:crypto";
import {
  InvalidExpenseAmountError,
  ExpenseNotDraftError,
  ExpenseNotSubmittedError,
  ExpenseNotCancellableError,
  ExpenseAlreadyCancelledError,
} from "./errors";

export const EXPENSE_STATUSES = ["DRAFT", "SUBMITTED", "POSTED", "CANCELLED"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

const CANCELLABLE_STATUSES: ExpenseStatus[] = ["DRAFT", "SUBMITTED"];

export interface ExpenseProps {
  branchId: string;
  businessDate: Date;
  categoryId: string;
  amount: number;
  notes: string | null;
  supplierId: string | null;
  status: ExpenseStatus;
  createdBy: string | null;
  postedBy: string | null;
  postedAt: Date | null;
  journalEntryId: string | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
}

// Expense - نفس مفهوم expenses في الريبو القديم بس مبسّط لحالتين انتقاليتين بدل أربعة (DRAFT/SUBMITTED/
// POSTED/CANCELLED - إسقاط APPROVED المنفصلة عمدًا: تعليق الريبو القديم نفسه بيقول إن /review
// (SUBMITTED->POSTED مباشرة) هو المسار الفعلي المستخدم عمليًا، والمسار التاني (/approve+/post منفصلين)
// "الأكمل الأصلي" بس - نفس تبسيط باقي الـcontext ده). التسجيل دايمًا SUBMITTED أو DRAFT (مش POSTED
// مباشرة من الأجريجيت - الترحيل الفوري، لو الطلب طالبه، بيحصل في الـhandler كـsubmit()+post() ورا
// بعض في نفس المعاملة، نفس فلسفة ConversionOrder.start/complete اللي بياخدوا movementId جاهز بدل ما
// ينشئوه بنفسهم). إلغاء مصروف POSTED مش هنا عمدًا - التصحيح بعد الترحيل عن طريق عكس القيد المحاسبي
// مباشرة (POST /accounting/journal-entries/:id/reverse الموجود بالفعل)، مش مسار إلغاء منفصل مكرر
export class Expense {
  private constructor(
    public readonly id: string,
    private props: ExpenseProps
  ) {}

  static register(input: {
    branchId: string;
    businessDate: Date;
    categoryId: string;
    amount: number;
    notes?: string | null;
    supplierId?: string | null;
    initialStatus?: "DRAFT" | "SUBMITTED";
    createdBy?: string | null;
    idempotencyKey?: string | null;
  }): Expense {
    if (!(input.amount > 0)) throw new InvalidExpenseAmountError();

    return new Expense(randomUUID(), {
      branchId: input.branchId,
      businessDate: input.businessDate,
      categoryId: input.categoryId,
      amount: input.amount,
      notes: input.notes ?? null,
      supplierId: input.supplierId ?? null,
      status: input.initialStatus ?? "SUBMITTED",
      createdBy: input.createdBy ?? null,
      postedBy: null,
      postedAt: null,
      journalEntryId: null,
      cancelledBy: null,
      cancelledAt: null,
      cancellationReason: null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: ExpenseProps): Expense {
    return new Expense(id, props);
  }

  edit(input: { categoryId?: string; amount?: number; notes?: string | null }): void {
    if (this.props.status !== "SUBMITTED") throw new ExpenseNotSubmittedError();
    if (input.categoryId !== undefined) this.props.categoryId = input.categoryId;
    if (input.amount !== undefined) {
      if (!(input.amount > 0)) throw new InvalidExpenseAmountError();
      this.props.amount = input.amount;
    }
    if (input.notes !== undefined) this.props.notes = input.notes;
  }

  submit(): void {
    if (this.props.status !== "DRAFT") throw new ExpenseNotDraftError();
    this.props.status = "SUBMITTED";
  }

  // بيتنفّذ بعد ما الـhandler يرحّل القيد المحاسبي الحقيقي (journalEntryId جاهز) - نفس فلسفة
  // ConversionOrder.complete()
  post(input: { journalEntryId: string; postedBy: string | null }): void {
    if (this.props.status !== "SUBMITTED") throw new ExpenseNotSubmittedError();
    this.props.status = "POSTED";
    this.props.journalEntryId = input.journalEntryId;
    this.props.postedBy = input.postedBy;
    this.props.postedAt = new Date();
  }

  cancel(input: { cancelledBy: string | null; reason: string }): void {
    if (this.props.status === "CANCELLED") throw new ExpenseAlreadyCancelledError();
    if (!CANCELLABLE_STATUSES.includes(this.props.status)) throw new ExpenseNotCancellableError();
    this.props.status = "CANCELLED";
    this.props.cancelledBy = input.cancelledBy;
    this.props.cancelledAt = new Date();
    this.props.cancellationReason = input.reason;
  }

  get branchId(): string { return this.props.branchId; }
  get businessDate(): Date { return this.props.businessDate; }
  get categoryId(): string { return this.props.categoryId; }
  get amount(): number { return this.props.amount; }
  get notes(): string | null { return this.props.notes; }
  get supplierId(): string | null { return this.props.supplierId; }
  get status(): ExpenseStatus { return this.props.status; }
  get createdBy(): string | null { return this.props.createdBy; }
  get postedBy(): string | null { return this.props.postedBy; }
  get postedAt(): Date | null { return this.props.postedAt; }
  get journalEntryId(): string | null { return this.props.journalEntryId; }
  get cancelledBy(): string | null { return this.props.cancelledBy; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }
  get cancellationReason(): string | null { return this.props.cancellationReason; }
  get idempotencyKey(): string | null { return this.props.idempotencyKey; }
  get createdAt(): Date { return this.props.createdAt; }
}
