import { randomUUID } from "node:crypto";
import {
  ConversionOrderNotDraftError,
  ConversionOrderNotApprovedError,
  ConversionOrderNotInProgressError,
  ConversionOrderAlreadyFinalizedError,
  ConversionVarianceReasonRequiredError,
  InvalidConversionQuantityError,
} from "./errors";

export const CONVERSION_ORDER_STATUSES = ["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type ConversionOrderStatus = (typeof CONVERSION_ORDER_STATUSES)[number];

// نفس pos_settings.production_variance_alert_percent الافتراضي (10) في الريبو القديم - القيمة الفعلية
// بتتحقن من الـapplication layer (CompleteConversionOrderHandler بيقراها من Settings context)، الثابت
// هنا fallback بس
export const PRODUCTION_VARIANCE_ALERT_PERCENT = 10;

export interface ConversionOrderInputLine {
  id: string;
  ingredientItemId: string;
  plannedQuantityPerUnit: number;
  plannedQuantity: number;
  actualQuantity: number | null;
  unitCost: number | null;
  movementId: string | null;
}

export interface ConversionOrderProps {
  branchId: string;
  recipeId: string;
  recipeVersionId: string;
  outputItemId: string;
  status: ConversionOrderStatus;
  plannedOutputQuantity: number;
  actualOutputQuantity: number | null;
  outputUnitCost: number | null;
  outputMovementId: string | null;
  inputLines: ConversionOrderInputLine[];
  varianceReason: string | null;
  notes: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  completedBy: string | null;
  cancelledBy: string | null;
  approvedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
}

// ConversionOrder - نفس مفهوم production_orders+packaging_orders في الريبو القديم بس موحّدين في مفهوم
// واحد (راجع خطة إعادة البناء §2 بند 5 "Production") - مكّن التوحيد ده لأن كل وصفة manufactured_item في
// Catalog بتحدد صنف مخزون ناتج واحد + مكوّناتها، فالتصنيع والتعبئة بقوا نفس الحاجة بالظبط: تحويل مكوّنات
// (وصفة) لصنف ناتج واحد. مفيش استكشاف وصفات فرعية متداخل (recipe explosion) هنا ولا في استهلاك البيع
// (راجع RegisterOrderHandler) - لو مكوّن نفسه "مصنّع"، لازم يتصنّع فعليًا برصيد حقيقي عن طريق ConversionOrder
// خاص بيه الأول؛ الاستهلاك دايمًا مباشر على رصيد حقيقي، مش حساب نظري متداخل. مفيش batch/FEFO tracking
// برضه (نفس تبسيط باقي Inventory) - production_order_batches بالكامل متأجّلة.
//
// standardUnitCost (المحسوب وقت complete من planned quantities × unitCost لحظة start) بيقيّم الناتج
// الفعلي بالتكلفة القياسية للوصفة - أي فرق بين ده وقيمة المكوّنات المستهلكة فعليًا (rawMaterialValue)
// هو "فرق إنتاج" (Yield Variance) حقيقي بيترحّل لحساب 5300، مش مجرد صفر دايمًا (لو كنت هقيّم الناتج من
// نفس تكلفة المستهلك فعليًا كان الفرق هيبقى صفر دايمًا وهيفقد الفايدة المحاسبية كلها)
export class ConversionOrder {
  private constructor(
    public readonly id: string,
    private props: ConversionOrderProps
  ) {}

  static register(input: {
    branchId: string;
    recipeId: string;
    recipeVersionId: string;
    outputItemId: string;
    plannedOutputQuantity: number;
    ingredients: { ingredientItemId: string; quantityPerUnit: number }[];
    notes?: string | null;
    createdBy?: string | null;
  }): ConversionOrder {
    if (!input.plannedOutputQuantity || input.plannedOutputQuantity <= 0) throw new InvalidConversionQuantityError();

    const inputLines: ConversionOrderInputLine[] = input.ingredients.map((ing) => ({
      id: randomUUID(),
      ingredientItemId: ing.ingredientItemId,
      plannedQuantityPerUnit: ing.quantityPerUnit,
      plannedQuantity: ing.quantityPerUnit * input.plannedOutputQuantity,
      actualQuantity: null,
      unitCost: null,
      movementId: null,
    }));

    return new ConversionOrder(randomUUID(), {
      branchId: input.branchId,
      recipeId: input.recipeId,
      recipeVersionId: input.recipeVersionId,
      outputItemId: input.outputItemId,
      status: "DRAFT",
      plannedOutputQuantity: input.plannedOutputQuantity,
      actualOutputQuantity: null,
      outputUnitCost: null,
      outputMovementId: null,
      inputLines,
      varianceReason: null,
      notes: input.notes ?? null,
      createdBy: input.createdBy ?? null,
      approvedBy: null,
      completedBy: null,
      cancelledBy: null,
      approvedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: ConversionOrderProps): ConversionOrder {
    return new ConversionOrder(id, props);
  }

  approve(approvedBy: string | null): void {
    if (this.props.status !== "DRAFT") throw new ConversionOrderNotDraftError();
    this.props.status = "APPROVED";
    this.props.approvedBy = approvedBy;
    this.props.approvedAt = new Date();
  }

  // بيتنفّذ بعد ما الـhandler يسجّل حركة استهلاك حقيقية لكل مكوّن (movementId حقيقي بالفعل) - الأجريجيت
  // هنا بس بيحدّث سطوره وحالته، مايعرفش حاجة عن StockMovementRepositoryPort
  start(consumptions: { ingredientItemId: string; actualQuantity: number; unitCost: number | null; movementId: string }[]): void {
    if (this.props.status !== "APPROVED") throw new ConversionOrderNotApprovedError();

    for (const consumption of consumptions) {
      const line = this.props.inputLines.find((l) => l.ingredientItemId === consumption.ingredientItemId);
      if (!line) continue;
      line.actualQuantity = consumption.actualQuantity;
      line.unitCost = consumption.unitCost;
      line.movementId = consumption.movementId;
    }
    this.props.status = "IN_PROGRESS";
    this.props.startedAt = new Date();
  }

  complete(input: {
    actualOutputQuantity: number;
    varianceReason?: string | null;
    outputUnitCost: number | null;
    outputMovementId: string;
    completedBy: string | null;
    varianceAlertPercent?: number;
  }): void {
    if (this.props.status !== "IN_PROGRESS") throw new ConversionOrderNotInProgressError();
    if (!input.actualOutputQuantity || input.actualOutputQuantity <= 0) throw new InvalidConversionQuantityError();

    const variancePercent =
      this.props.plannedOutputQuantity > 0
        ? ((input.actualOutputQuantity - this.props.plannedOutputQuantity) / this.props.plannedOutputQuantity) * 100
        : 0;
    const alertPercent = input.varianceAlertPercent ?? PRODUCTION_VARIANCE_ALERT_PERCENT;
    if (Math.abs(variancePercent) > alertPercent && !input.varianceReason) {
      throw new ConversionVarianceReasonRequiredError(variancePercent, alertPercent);
    }

    this.props.status = "COMPLETED";
    this.props.actualOutputQuantity = input.actualOutputQuantity;
    this.props.varianceReason = input.varianceReason ?? null;
    this.props.outputUnitCost = input.outputUnitCost;
    this.props.outputMovementId = input.outputMovementId;
    this.props.completedBy = input.completedBy;
    this.props.completedAt = new Date();
  }

  cancel(input: { cancelledBy?: string | null; reason?: string | null }): void {
    if (this.props.status === "COMPLETED" || this.props.status === "CANCELLED") {
      throw new ConversionOrderAlreadyFinalizedError();
    }
    this.props.status = "CANCELLED";
    this.props.cancelledBy = input.cancelledBy ?? null;
    this.props.cancelledAt = new Date();
    this.props.notes = input.reason ? `${this.props.notes ?? ""} - إلغاء: ${input.reason}`.trim() : this.props.notes;
  }

  get branchId(): string { return this.props.branchId; }
  get recipeId(): string { return this.props.recipeId; }
  get recipeVersionId(): string { return this.props.recipeVersionId; }
  get outputItemId(): string { return this.props.outputItemId; }
  get status(): ConversionOrderStatus { return this.props.status; }
  get plannedOutputQuantity(): number { return this.props.plannedOutputQuantity; }
  get actualOutputQuantity(): number | null { return this.props.actualOutputQuantity; }
  get outputUnitCost(): number | null { return this.props.outputUnitCost; }
  get outputMovementId(): string | null { return this.props.outputMovementId; }
  get inputLines(): readonly ConversionOrderInputLine[] { return this.props.inputLines; }
  get varianceReason(): string | null { return this.props.varianceReason; }
  get notes(): string | null { return this.props.notes; }
  get createdBy(): string | null { return this.props.createdBy; }
  get approvedBy(): string | null { return this.props.approvedBy; }
  get completedBy(): string | null { return this.props.completedBy; }
  get cancelledBy(): string | null { return this.props.cancelledBy; }
  get approvedAt(): Date | null { return this.props.approvedAt; }
  get startedAt(): Date | null { return this.props.startedAt; }
  get completedAt(): Date | null { return this.props.completedAt; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }
  get createdAt(): Date { return this.props.createdAt; }
}
