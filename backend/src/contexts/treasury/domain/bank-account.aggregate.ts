import { randomUUID } from "node:crypto";

export interface BankAccountProps {
  bankId: string;
  treasuryId: string;
  accountNumber: string | null;
  iban: string | null;
  bankBranchName: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
}

// BankAccount - بيانات الحساب البنكي الوصفية بس (رقم الحساب/IBAN/فرع البنك) - الحساب المحاسبي الحقيقي
// (اللي بيتحسب منه الرصيد) وحساب الخزينة اللي بيتباعوا معاه ثابتين ومربوطين وقت الإنشاء (نفس تعليق
// الريبو القديم بالظبط: "تعديل بيانات الحساب البنكي - مش الحساب المحاسبي نفسه، ده ثابت")
export class BankAccount {
  private constructor(
    public readonly id: string,
    private props: BankAccountProps
  ) {}

  static register(input: {
    bankId: string;
    treasuryId: string;
    accountNumber?: string | null;
    iban?: string | null;
    bankBranchName?: string | null;
    notes?: string | null;
  }): BankAccount {
    return new BankAccount(randomUUID(), {
      bankId: input.bankId,
      treasuryId: input.treasuryId,
      accountNumber: input.accountNumber ?? null,
      iban: input.iban ?? null,
      bankBranchName: input.bankBranchName ?? null,
      notes: input.notes ?? null,
      isActive: true,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: BankAccountProps): BankAccount {
    return new BankAccount(id, props);
  }

  updateDetails(input: {
    accountNumber?: string | null;
    iban?: string | null;
    bankBranchName?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }): void {
    if (input.accountNumber !== undefined) this.props.accountNumber = input.accountNumber;
    if (input.iban !== undefined) this.props.iban = input.iban;
    if (input.bankBranchName !== undefined) this.props.bankBranchName = input.bankBranchName;
    if (input.notes !== undefined) this.props.notes = input.notes;
    if (input.isActive !== undefined) this.props.isActive = input.isActive;
  }

  get bankId(): string { return this.props.bankId; }
  get treasuryId(): string { return this.props.treasuryId; }
  get accountNumber(): string | null { return this.props.accountNumber; }
  get iban(): string | null { return this.props.iban; }
  get bankBranchName(): string | null { return this.props.bankBranchName; }
  get notes(): string | null { return this.props.notes; }
  get isActive(): boolean { return this.props.isActive; }
  get createdAt(): Date { return this.props.createdAt; }
}
