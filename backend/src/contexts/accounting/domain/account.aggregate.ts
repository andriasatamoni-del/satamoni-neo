import { randomUUID } from "node:crypto";
import { AccountCodeRequiredError, UnknownAccountTypeError } from "./errors";

export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "COGS", "EXPENSE"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface AccountProps {
  code: string;
  name: string;
  accountType: AccountType;
  parentAccountId: string | null;
  branchId: string | null;
  isActive: boolean;
  isSystemAccount: boolean;
  legacyAccountId: number | null;
  createdAt: Date;
}

// Account - نفس مفهوم accounts في الريبو القديم بالظبط (دليل الحسابات). مفيش تغيير في القواعد الجوهرية
// هنا عمدًا - راجع خطة إعادة البناء: "Explicitly do not redesign the double-entry ledger's rules".
export class Account {
  private constructor(
    public readonly id: string,
    private props: AccountProps
  ) {}

  static register(input: {
    code: string;
    name: string;
    accountType: string;
    parentAccountId?: string | null;
    branchId?: string | null;
    isSystemAccount?: boolean;
    legacyAccountId?: number | null;
  }): Account {
    const code = input.code.trim();
    if (!code) throw new AccountCodeRequiredError();
    if (!ACCOUNT_TYPES.includes(input.accountType as AccountType)) throw new UnknownAccountTypeError(input.accountType);

    return new Account(randomUUID(), {
      code,
      name: input.name.trim(),
      accountType: input.accountType as AccountType,
      parentAccountId: input.parentAccountId ?? null,
      branchId: input.branchId ?? null,
      isActive: true,
      isSystemAccount: !!input.isSystemAccount,
      legacyAccountId: input.legacyAccountId ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: AccountProps): Account {
    return new Account(id, props);
  }

  deactivate(): void { this.props.isActive = false; }
  activate(): void { this.props.isActive = true; }

  // بيتنفّذ وقت إعادة استيراد دليل الحسابات (idempotent) - عشان تحديثات فعلية في الريبو القديم (تغيير
  // اسم حساب، نقل فرع، أو ضبط الأب بعد ما كل الحسابات اتسجلت) تنعكس هنا كمان، مش بس أول استيراد
  updateDetails(input: { name: string; accountType: string; parentAccountId?: string | null; branchId?: string | null; isActive?: boolean; isSystemAccount?: boolean }): void {
    if (!ACCOUNT_TYPES.includes(input.accountType as AccountType)) throw new UnknownAccountTypeError(input.accountType);
    this.props.name = input.name.trim();
    this.props.accountType = input.accountType as AccountType;
    if (input.parentAccountId !== undefined) this.props.parentAccountId = input.parentAccountId;
    if (input.branchId !== undefined) this.props.branchId = input.branchId;
    if (input.isActive !== undefined) this.props.isActive = input.isActive;
    if (input.isSystemAccount !== undefined) this.props.isSystemAccount = input.isSystemAccount;
  }

  get code(): string { return this.props.code; }
  get name(): string { return this.props.name; }
  get accountType(): AccountType { return this.props.accountType; }
  get parentAccountId(): string | null { return this.props.parentAccountId; }
  get branchId(): string | null { return this.props.branchId; }
  get isActive(): boolean { return this.props.isActive; }
  get isSystemAccount(): boolean { return this.props.isSystemAccount; }
  get legacyAccountId(): number | null { return this.props.legacyAccountId; }
  get createdAt(): Date { return this.props.createdAt; }
}
