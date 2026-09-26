import { randomUUID } from "node:crypto";

export const INTEGRATION_ERROR_STAGES = ["WEBHOOK", "SYNC", "CANCELLATION"] as const;
export type IntegrationErrorStage = (typeof INTEGRATION_ERROR_STAGES)[number];

export const INTEGRATION_ERROR_STATUSES = ["OPEN", "RETRYING", "RESOLVED"] as const;
export type IntegrationErrorStatus = (typeof INTEGRATION_ERROR_STATUSES)[number];

export interface TalabatIntegrationErrorProps {
  stage: IntegrationErrorStage;
  talabatOrderId: string | null;
  message: string;
  context: unknown;
  retryCount: number;
  lastRetryAt: Date | null;
  status: IntegrationErrorStatus;
  createdAt: Date;
  updatedAt: Date;
}

// TalabatIntegrationError - أي فشل في أي مرحلة من خط أنابيب Talabat (webhook/mapping/order-creation/
// cancellation) بيتسجّل هنا مرئي ومتابع (نفس مفهوم talabat_integration_errors بالريبو القديم بالظبط)،
// مش بيتبلع صامت في log وبس. retry() بتزود العداد وتحدّث آخر وقت محاولة - resolve() بس بعد نجاح فعلي.
export class TalabatIntegrationError {
  private constructor(
    public readonly id: string,
    private props: TalabatIntegrationErrorProps
  ) {}

  static register(input: { stage: string; talabatOrderId?: string | null; message: string; context?: unknown }): TalabatIntegrationError {
    const now = new Date();
    return new TalabatIntegrationError(randomUUID(), {
      stage: input.stage as IntegrationErrorStage,
      talabatOrderId: input.talabatOrderId ?? null,
      message: input.message,
      context: input.context ?? null,
      retryCount: 0,
      lastRetryAt: null,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(id: string, props: TalabatIntegrationErrorProps): TalabatIntegrationError {
    return new TalabatIntegrationError(id, props);
  }

  markRetrying(): void {
    this.props.status = "RETRYING";
    this.props.retryCount += 1;
    this.props.lastRetryAt = new Date();
    this.props.updatedAt = new Date();
  }

  resolve(): void {
    this.props.status = "RESOLVED";
    this.props.updatedAt = new Date();
  }

  reopen(message: string): void {
    this.props.status = "OPEN";
    this.props.message = message;
    this.props.updatedAt = new Date();
  }

  get stage(): IntegrationErrorStage { return this.props.stage; }
  get talabatOrderId(): string | null { return this.props.talabatOrderId; }
  get message(): string { return this.props.message; }
  get context(): unknown { return this.props.context; }
  get retryCount(): number { return this.props.retryCount; }
  get lastRetryAt(): Date | null { return this.props.lastRetryAt; }
  get status(): IntegrationErrorStatus { return this.props.status; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
