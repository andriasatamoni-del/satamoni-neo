import { randomUUID } from "node:crypto";
import { TreasuryBranchRequiredError, UnknownTreasuryKindError } from "./errors";

export const TREASURY_KINDS = ["MAIN", "BANK"] as const;
export type TreasuryKind = (typeof TREASURY_KINDS)[number];

export interface TreasuryProps {
  name: string;
  kind: TreasuryKind;
  branchId: string | null;
  accountId: string;
  createdAt: Date;
}

// Treasury - نفس مفهوم treasuries في الريبو القديم بالظبط: واجهة صديقة فوق حساب حقيقي في دليل الحسابات
// (Accounting context) - مفيش رصيد مخزّن هنا خالص، بيتحسب لحظيًا من journal_entry_lines عن طريق
// TreasuryBalanceReaderPort. درج الكاشير أثناء شيفته (تالت نوع خزينة في الريبو القديم) اتبنى قبل كده
// كـcashier_shifts (Shifts context) - مش خزينة تالتة هنا عمدًا، نفس المفهوم بالظبط.
export class Treasury {
  private constructor(
    public readonly id: string,
    private props: TreasuryProps
  ) {}

  static register(input: { name: string; kind: string; branchId?: string | null; accountId: string }): Treasury {
    if (!TREASURY_KINDS.includes(input.kind as TreasuryKind)) throw new UnknownTreasuryKindError(input.kind);
    if (input.kind === "MAIN" && !input.branchId) throw new TreasuryBranchRequiredError();

    return new Treasury(randomUUID(), {
      name: input.name.trim(),
      kind: input.kind as TreasuryKind,
      branchId: input.branchId ?? null,
      accountId: input.accountId,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: TreasuryProps): Treasury {
    return new Treasury(id, props);
  }

  get name(): string { return this.props.name; }
  get kind(): TreasuryKind { return this.props.kind; }
  get branchId(): string | null { return this.props.branchId; }
  get accountId(): string { return this.props.accountId; }
  get createdAt(): Date { return this.props.createdAt; }
}
