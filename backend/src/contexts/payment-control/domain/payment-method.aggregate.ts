import { randomUUID } from "node:crypto";
import { PaymentMethodNameRequiredError, UnknownPaymentMethodKindError, UnknownSettlementChannelError } from "./errors";

export const PAYMENT_METHOD_KINDS = ["cash", "card_or_wallet", "credit"] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

export const SETTLEMENT_CHANNELS = ["visa_pos", "instapay", "orange_cash", "vodafone_cash"] as const;
export type SettlementChannel = (typeof SETTLEMENT_CHANNELS)[number];

export interface PaymentMethodProps {
  name: string;
  kind: PaymentMethodKind;
  settlementChannel: SettlementChannel | null;
  isActive: boolean;
  legacyPaymentMethodId: number | null;
  // كود دفع Talabat المقابل لطريقة الدفع دي - نفس مفهوم payment_methods.talabat_payment_code بالريبو
  // القديم بالظبط (TAL-1). NULL يعني الطريقة دي لسه مش مربوطة بـTalabat.
  talabatPaymentCode: string | null;
  createdAt: Date;
}

// PaymentMethod - نفس مفهوم payment_methods في الريبو القديم (كاش/كارت أو محفظة/آجل، مع قناة تسوية
// اختيارية بتحدد أي كشف حساب خارجي بيتطابق مع دفعات الطريقة دي - فيزا POS/إنستاباي/أورانج كاش/فودافون
// كاش). كاش وآجل مالهمش قناة تسوية (مفيش كشف حساب خارجي يتطابق معاهم).
export class PaymentMethod {
  private constructor(
    public readonly id: string,
    private props: PaymentMethodProps
  ) {}

  static register(input: {
    name: string;
    kind: string;
    settlementChannel?: string | null;
    legacyPaymentMethodId?: number | null;
  }): PaymentMethod {
    const name = input.name.trim();
    if (!name) throw new PaymentMethodNameRequiredError();
    if (!PAYMENT_METHOD_KINDS.includes(input.kind as PaymentMethodKind)) throw new UnknownPaymentMethodKindError(input.kind);
    if (input.settlementChannel && !SETTLEMENT_CHANNELS.includes(input.settlementChannel as SettlementChannel)) {
      throw new UnknownSettlementChannelError(input.settlementChannel);
    }

    return new PaymentMethod(randomUUID(), {
      name,
      kind: input.kind as PaymentMethodKind,
      settlementChannel: (input.settlementChannel as SettlementChannel) ?? null,
      isActive: true,
      legacyPaymentMethodId: input.legacyPaymentMethodId ?? null,
      talabatPaymentCode: null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: PaymentMethodProps): PaymentMethod {
    return new PaymentMethod(id, props);
  }

  updateDetails(input: { name: string; kind: string; settlementChannel?: string | null; isActive?: boolean }): void {
    const name = input.name.trim();
    if (!name) throw new PaymentMethodNameRequiredError();
    if (!PAYMENT_METHOD_KINDS.includes(input.kind as PaymentMethodKind)) throw new UnknownPaymentMethodKindError(input.kind);
    if (input.settlementChannel && !SETTLEMENT_CHANNELS.includes(input.settlementChannel as SettlementChannel)) {
      throw new UnknownSettlementChannelError(input.settlementChannel);
    }
    this.props.name = name;
    this.props.kind = input.kind as PaymentMethodKind;
    if (input.settlementChannel !== undefined) this.props.settlementChannel = (input.settlementChannel as SettlementChannel) ?? null;
    if (input.isActive !== undefined) this.props.isActive = input.isActive;
  }

  deactivate(): void { this.props.isActive = false; }
  activate(): void { this.props.isActive = true; }

  linkTalabatCode(talabatPaymentCode: string | null): void {
    this.props.talabatPaymentCode = talabatPaymentCode;
  }

  get name(): string { return this.props.name; }
  get kind(): PaymentMethodKind { return this.props.kind; }
  get settlementChannel(): SettlementChannel | null { return this.props.settlementChannel; }
  get isActive(): boolean { return this.props.isActive; }
  get legacyPaymentMethodId(): number | null { return this.props.legacyPaymentMethodId; }
  get talabatPaymentCode(): string | null { return this.props.talabatPaymentCode; }
  get createdAt(): Date { return this.props.createdAt; }
}
