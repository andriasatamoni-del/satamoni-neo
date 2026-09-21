import { randomUUID } from "node:crypto";

export const PRINT_TYPES = [
  "CUSTOMER_RECEIPT", "KITCHEN_TICKET", "KITCHEN_SUMMARY",
  "DELIVERY_SUMMARY", "DELIVERY_FINAL_RECEIPT", "DINE_IN_BILL", "TEST_PRINT",
] as const;
export type PrintType = (typeof PRINT_TYPES)[number];

export const PRINT_JOB_STATUSES = ["PENDING", "PRINTING", "PRINTED", "FAILED", "CANCELLED"] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];

const NO_PRINTER_ERROR = "لا يوجد طابعة موجّهة لهذا النوع/المحطة - راجع إعدادات الطباعة";

export interface PrintJobProps {
  orderId: string | null;
  branchId: string;
  printType: PrintType;
  printerId: string | null;
  stationId: string | null;
  status: PrintJobStatus;
  contentHtml: string;
  idempotencyKey: string;
  attempts: number;
  lastError: string | null;
  createdBy: string | null;
  createdAt: Date;
  printingStartedAt: Date | null;
  printedAt: Date | null;
  failedAt: Date | null;
}

// PrintJob - نفس مفهوم print_jobs في الريبو القديم بالظبط. دورة الحياة:
// PENDING -> (claim) -> PRINTING -> (printed/failed) -> PRINTED/FAILED. لو التوجيه (طابعة/محطة) مش
// متظبط وقت الإنشاء، السطر بيتسجّل FAILED فورًا بسبب واضح - بدل ما يختفي بصمت - لكن من غير ما يوقف
// تسجيل الطلب نفسه. idempotencyKey هو اللي بيمنع تكرار الطباعة عند retry/دبل كليك (upsert عليه في
// الـrepository - نفس فلسفة idempotency_key في Accounting/Inventory بالظبط).
// انتقالات الحالة (claim/printed/failed/retry) مش methods هنا عمدًا - كل واحدة لازم تكون UPDATE ذرّي
// بشرط الحالة الحالية على مستوى الداتابيز نفسها (راجع PrintJobRepositoryPort) عشان لو أكتر من وكيل
// طباعة حاولوا ياخدوا نفس الـjob في نفس اللحظة، مش هيحصل تكرار طباعة أبدًا - "حمّل، عدّل، احفظ" عادي
// (زي باقي الأجريجيتس) بيسيب فجوة سباق بين القراءة والكتابة، وده بالظبط اللي المواصفة بتمنعه هنا
export class PrintJob {
  private constructor(
    public readonly id: string,
    private props: PrintJobProps
  ) {}

  static queue(input: {
    orderId?: string | null;
    branchId: string;
    printType: string;
    printerId?: string | null;
    stationId?: string | null;
    contentHtml: string;
    idempotencyKey: string;
    createdBy?: string | null;
    errorReason?: string;
  }): PrintJob {
    const status: PrintJobStatus = input.printerId ? "PENDING" : "FAILED";
    const now = new Date();
    return new PrintJob(randomUUID(), {
      orderId: input.orderId ?? null,
      branchId: input.branchId,
      printType: input.printType as PrintType,
      printerId: input.printerId ?? null,
      stationId: input.stationId ?? null,
      status,
      contentHtml: input.contentHtml,
      idempotencyKey: input.idempotencyKey,
      attempts: 0,
      lastError: status === "FAILED" ? (input.errorReason ?? NO_PRINTER_ERROR) : null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      printingStartedAt: null,
      printedAt: null,
      failedAt: status === "FAILED" ? now : null,
    });
  }

  static reconstitute(id: string, props: PrintJobProps): PrintJob {
    return new PrintJob(id, props);
  }

  get orderId(): string | null { return this.props.orderId; }
  get branchId(): string { return this.props.branchId; }
  get printType(): PrintType { return this.props.printType; }
  get printerId(): string | null { return this.props.printerId; }
  get stationId(): string | null { return this.props.stationId; }
  get status(): PrintJobStatus { return this.props.status; }
  get contentHtml(): string { return this.props.contentHtml; }
  get idempotencyKey(): string { return this.props.idempotencyKey; }
  get attempts(): number { return this.props.attempts; }
  get lastError(): string | null { return this.props.lastError; }
  get createdBy(): string | null { return this.props.createdBy; }
  get createdAt(): Date { return this.props.createdAt; }
  get printingStartedAt(): Date | null { return this.props.printingStartedAt; }
  get printedAt(): Date | null { return this.props.printedAt; }
  get failedAt(): Date | null { return this.props.failedAt; }
}
