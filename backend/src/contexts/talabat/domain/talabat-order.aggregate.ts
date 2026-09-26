import { randomUUID } from "node:crypto";

export const TALABAT_ORDER_STATUSES = ["RECEIVED", "MAPPING_ERROR", "IMPORTED", "FAILED", "CANCELED"] as const;
export type TalabatOrderStatus = (typeof TALABAT_ORDER_STATUSES)[number];

export const CANCELLATION_SOURCES = ["TALABAT", "ORPHAN"] as const;
export type CancellationSource = (typeof CANCELLATION_SOURCES)[number];

export interface TalabatOrderProps {
  talabatOrderId: string;
  branchId: string | null;
  posOrderId: string | null;
  status: TalabatOrderStatus;
  rawPayload: unknown;
  errorReason: string | null;
  canceledAt: Date | null;
  cancellationSource: CancellationSource | null;
  createdAt: Date;
  updatedAt: Date;
}

// TalabatOrder - صف تتبّع 1:1 لكل أوردر Talabat (نفس مفهوم talabat_orders بالريبو القديم بالظبط،
// TAL-1). مش الأوردر نفسه - Orders context هو المالك الوحيد لمفهوم "أوردر"؛ الـaggregate ده بيتتبّع
// بس رحلة أوردر Talabat خارجي لحد ما (لو نجح) يتربط بأوردر POS حقيقي واحد (posOrderId)، بما فيه كل
// حالات الفشل بالطريق (MAPPING_ERROR/FAILED) - الإلغاء نفسه دايمًا مرئي، مش DELETE أبدًا.
export class TalabatOrder {
  private constructor(
    public readonly id: string,
    private props: TalabatOrderProps
  ) {}

  static receive(input: { talabatOrderId: string; rawPayload: unknown }): TalabatOrder {
    const now = new Date();
    return new TalabatOrder(randomUUID(), {
      talabatOrderId: input.talabatOrderId,
      branchId: null,
      posOrderId: null,
      status: "RECEIVED",
      rawPayload: input.rawPayload,
      errorReason: null,
      canceledAt: null,
      cancellationSource: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(id: string, props: TalabatOrderProps): TalabatOrder {
    return new TalabatOrder(id, props);
  }

  markMappingError(input: { branchId: string | null; reason: string }): void {
    this.props.branchId = input.branchId;
    this.props.status = "MAPPING_ERROR";
    this.props.errorReason = input.reason;
    this.props.updatedAt = new Date();
  }

  markFailed(input: { branchId: string; reason: string }): void {
    this.props.branchId = input.branchId;
    this.props.status = "FAILED";
    this.props.errorReason = input.reason;
    this.props.updatedAt = new Date();
  }

  markImported(input: { branchId: string; posOrderId: string }): void {
    this.props.branchId = input.branchId;
    this.props.posOrderId = input.posOrderId;
    this.props.status = "IMPORTED";
    this.props.errorReason = null;
    this.props.updatedAt = new Date();
  }

  cancel(source: CancellationSource): void {
    this.props.status = "CANCELED";
    this.props.cancellationSource = source;
    this.props.canceledAt = new Date();
    this.props.updatedAt = new Date();
  }

  get talabatOrderId(): string { return this.props.talabatOrderId; }
  get branchId(): string | null { return this.props.branchId; }
  get posOrderId(): string | null { return this.props.posOrderId; }
  get status(): TalabatOrderStatus { return this.props.status; }
  get rawPayload(): unknown { return this.props.rawPayload; }
  get errorReason(): string | null { return this.props.errorReason; }
  get canceledAt(): Date | null { return this.props.canceledAt; }
  get cancellationSource(): CancellationSource | null { return this.props.cancellationSource; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
