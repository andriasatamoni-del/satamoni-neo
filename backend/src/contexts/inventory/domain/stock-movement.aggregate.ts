import { randomUUID } from "node:crypto";
import { UnknownMovementTypeError, ZeroQuantityMovementError } from "./errors";

export const MOVEMENT_TYPES = [
  "RECEIPT",
  "CONSUMPTION",
  "ADJUSTMENT",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "OPENING_BALANCE",
  "RETURN_TO_SUPPLIER",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export interface StockMovementProps {
  inventoryItemId: string;
  branchId: string;
  movementType: MovementType;
  quantityDelta: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  performedBy: string | null;
  occurredAt: Date;
  legacyReferenceKey: string | null;
}

// StockMovement - سطر واحد في ليدجر المخزون (نفس مفهوم inventory_movements في الريبو القديم: مصدر
// الحقيقة الوحيد لأي تغيير في الرصيد، مش جدول رصيد بيتحدّث مباشرة من غير أثر). كل حركة إما بتزوّد
// الرصيد (quantityDelta موجب: RECEIPT/TRANSFER_IN/OPENING_BALANCE) أو بتنقصه (سالب: CONSUMPTION/
// TRANSFER_OUT، أو ADJUSTMENT ممكن تكون أي اتجاه). الرصيد الفعلي بيتحسب/يتحدّث ذريًا مع كل حركة في
// نفس المعاملة (راجع KyselyStockMovementRepository.recordMovement) - مفيش تحديث رصيد منفصل عن تسجيل
// الحركة، عشان الرصيد يفضل دايمًا = مجموع الحركات بالظبط (نفس المبدأ اللي inventory_discrepancies في
// الريبو القديم بيتأكد منه).
export class StockMovement {
  private constructor(
    public readonly id: string,
    private props: StockMovementProps
  ) {}

  static register(input: {
    inventoryItemId: string;
    branchId: string;
    movementType: string;
    quantityDelta: number;
    reason?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
    performedBy?: string | null;
    legacyReferenceKey?: string | null;
  }): StockMovement {
    if (!MOVEMENT_TYPES.includes(input.movementType as MovementType)) {
      throw new UnknownMovementTypeError(input.movementType);
    }
    if (input.quantityDelta === 0) throw new ZeroQuantityMovementError();

    return new StockMovement(randomUUID(), {
      inventoryItemId: input.inventoryItemId,
      branchId: input.branchId,
      movementType: input.movementType as MovementType,
      quantityDelta: input.quantityDelta,
      reason: input.reason ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      performedBy: input.performedBy ?? null,
      occurredAt: new Date(),
      legacyReferenceKey: input.legacyReferenceKey ?? null,
    });
  }

  static reconstitute(id: string, props: StockMovementProps): StockMovement {
    return new StockMovement(id, props);
  }

  get inventoryItemId(): string { return this.props.inventoryItemId; }
  get branchId(): string { return this.props.branchId; }
  get movementType(): MovementType { return this.props.movementType; }
  get quantityDelta(): number { return this.props.quantityDelta; }
  get reason(): string | null { return this.props.reason; }
  get referenceType(): string | null { return this.props.referenceType; }
  get referenceId(): string | null { return this.props.referenceId; }
  get performedBy(): string | null { return this.props.performedBy; }
  get occurredAt(): Date { return this.props.occurredAt; }
  get legacyReferenceKey(): string | null { return this.props.legacyReferenceKey; }
}
