import { randomUUID } from "node:crypto";
import { InsufficientBatchQuantityError, InventoryBatchNotActiveError } from "./errors";

export const INVENTORY_BATCH_STATUSES = ["active", "depleted", "expired"] as const;
export type InventoryBatchStatus = (typeof INVENTORY_BATCH_STATUSES)[number];

export const INVENTORY_BATCH_SOURCE_TYPES = ["purchase", "production"] as const;
export type InventoryBatchSourceType = (typeof INVENTORY_BATCH_SOURCE_TYPES)[number];

export interface InventoryBatchProps {
  batchNumber: string;
  inventoryItemId: string;
  branchId: string;
  receivedQuantity: number;
  remainingQuantity: number;
  unitCost: number | null;
  expiryDate: Date | null;
  productionDate: Date | null;
  sourceType: InventoryBatchSourceType;
  sourceId: string;
  status: InventoryBatchStatus;
  createdBy: string | null;
  createdAt: Date;
}

// InventoryBatch (BATCH-1) - نفس مفهوم inventory_batches بالريبو القديم، بس نطاق مبسّط عمدًا: دفعة
// بتتسجّل بس عند استلام رسمي (GoodsReceipt.confirm) أو إنتاج (ConversionOrder.complete) - نفس نقطتين
// الإنشاء الأساسيتين في الريبو القديم (routes/goods-receipts.js وroutes/production.js)، ومش إجباري
// (زي هناك بالظبط: بس لو الصنف له تاريخ صلاحية فعلي حابب يتسجّل).
//
// قرارات نطاق موثّقة (مش متضمنة هنا):
// - مفيش استهلاك FEFO تلقائي مربوط بكل حركة مخزون صادرة (بيع/هالك/تحويل) - ده يحتاج إعادة تصميم لكل
//   نقطة استهلاك في النظام (RegisterOrderHandler وغيره) عشان تربط كل وحدة مستهلكة بدفعة معيّنة، مش مجرد
//   إضافة قراءة. الاستهلاك هنا يدوي بس (recordConsumption) - المستخدم بيحدد إيه اتستهلك من إيه دفعة.
// - مفيش تتبّع عبر التعبئة/التحويلات بين الفروع (packaging_order_batches وkitchen_transfer_item_batches
//   بالريبو القديم) - Production في neo موحّد بالفعل (production+packaging = ConversionOrder واحد)،
//   والتحويلات هنا مش batch-aware لسه.
// - مفيش تتبّع رجعي متعدد المستويات (traceBackward بالريبو القديم، لحد عمق 15 مستوى عبر سلسلة
//   تصنيع/تعبئة/تحويل كاملة) - التتبّع هنا مستوى واحد بس: مصدر الدفعة المباشر (GRN أو أمر تصنيع).
// - مفيش مسار مشترى نقدي طارئ (purchases context) - نفس الريبو القديم بالظبط (مفيش batch_id هناك أصلًا).
export class InventoryBatch {
  private constructor(
    public readonly id: string,
    private props: InventoryBatchProps
  ) {}

  static register(input: {
    batchNumber: string;
    inventoryItemId: string;
    branchId: string;
    quantity: number;
    unitCost?: number | null;
    expiryDate?: Date | null;
    productionDate?: Date | null;
    sourceType: InventoryBatchSourceType;
    sourceId: string;
    createdBy?: string | null;
  }): InventoryBatch {
    return new InventoryBatch(randomUUID(), {
      batchNumber: input.batchNumber,
      inventoryItemId: input.inventoryItemId,
      branchId: input.branchId,
      receivedQuantity: input.quantity,
      remainingQuantity: input.quantity,
      unitCost: input.unitCost ?? null,
      expiryDate: input.expiryDate ?? null,
      productionDate: input.productionDate ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: "active",
      createdBy: input.createdBy ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: InventoryBatchProps): InventoryBatch {
    return new InventoryBatch(id, props);
  }

  // استهلاك يدوي (هالك/تلف/استخدام مش مرتبط بحركة مخزون منفصلة) - بينقص المتبقي، وبيقفل الدفعة تلقائيًا
  // (status=depleted) لو المتبقي وصل صفر
  recordConsumption(quantity: number): void {
    if (this.props.status !== "active") throw new InventoryBatchNotActiveError();
    if (quantity > this.props.remainingQuantity) throw new InsufficientBatchQuantityError();
    this.props.remainingQuantity -= quantity;
    if (this.props.remainingQuantity === 0) this.props.status = "depleted";
  }

  markExpired(): void {
    if (this.props.status !== "active") throw new InventoryBatchNotActiveError();
    this.props.status = "expired";
  }

  get batchNumber(): string { return this.props.batchNumber; }
  get inventoryItemId(): string { return this.props.inventoryItemId; }
  get branchId(): string { return this.props.branchId; }
  get receivedQuantity(): number { return this.props.receivedQuantity; }
  get remainingQuantity(): number { return this.props.remainingQuantity; }
  get unitCost(): number | null { return this.props.unitCost; }
  get expiryDate(): Date | null { return this.props.expiryDate; }
  get productionDate(): Date | null { return this.props.productionDate; }
  get sourceType(): InventoryBatchSourceType { return this.props.sourceType; }
  get sourceId(): string { return this.props.sourceId; }
  get status(): InventoryBatchStatus { return this.props.status; }
  get createdBy(): string | null { return this.props.createdBy; }
  get createdAt(): Date { return this.props.createdAt; }
}
