import { randomUUID } from "node:crypto";
import { InvalidSupplierPaymentAmountError } from "./errors";

export interface SupplierPaymentProps {
  supplierId: string;
  branchId: string;
  supplierInvoiceId: string | null;
  treasuryId: string;
  amount: number;
  paymentDate: Date;
  referenceNumber: string | null;
  notes: string | null;
  journalEntryId: string | null;
  createdBy: string | null;
  createdAt: Date;
}

// SupplierPayment - نفس مفهوم سداد المورد في الريبو القديم (DR حسابات دائنة 2100 / CR مصدر الكاش)، بس
// هنا مصدر الكاش خزينة محددة صراحة (treasuryId) بدل استنتاج حساب كاش/بنك من نوع طريقة الدفع - أوضح،
// ومتاح بس لأن Treasury context موجود بالفعل (migration 015)
export class SupplierPayment {
  private constructor(
    public readonly id: string,
    private props: SupplierPaymentProps
  ) {}

  static register(input: {
    supplierId: string;
    branchId: string;
    supplierInvoiceId?: string | null;
    treasuryId: string;
    amount: number;
    paymentDate?: Date;
    referenceNumber?: string | null;
    notes?: string | null;
    createdBy?: string | null;
  }): SupplierPayment {
    if (!(input.amount > 0)) throw new InvalidSupplierPaymentAmountError();

    return new SupplierPayment(randomUUID(), {
      supplierId: input.supplierId,
      branchId: input.branchId,
      supplierInvoiceId: input.supplierInvoiceId ?? null,
      treasuryId: input.treasuryId,
      amount: input.amount,
      paymentDate: input.paymentDate ?? new Date(),
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      journalEntryId: null,
      createdBy: input.createdBy ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: SupplierPaymentProps): SupplierPayment {
    return new SupplierPayment(id, props);
  }

  assignJournalEntry(journalEntryId: string): void {
    this.props.journalEntryId = journalEntryId;
  }

  get supplierId(): string { return this.props.supplierId; }
  get branchId(): string { return this.props.branchId; }
  get supplierInvoiceId(): string | null { return this.props.supplierInvoiceId; }
  get treasuryId(): string { return this.props.treasuryId; }
  get amount(): number { return this.props.amount; }
  get paymentDate(): Date { return this.props.paymentDate; }
  get referenceNumber(): string | null { return this.props.referenceNumber; }
  get notes(): string | null { return this.props.notes; }
  get journalEntryId(): string | null { return this.props.journalEntryId; }
  get createdBy(): string | null { return this.props.createdBy; }
  get createdAt(): Date { return this.props.createdAt; }
}
