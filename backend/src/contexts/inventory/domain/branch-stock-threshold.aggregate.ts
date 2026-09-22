import { NegativeStockThresholdError } from "./errors";

export interface BranchStockThresholdProps {
  branchId: string;
  inventoryItemId: string;
  reorderPoint: number | null;
  minStock: number | null;
  maxStock: number | null;
  updatedBy: string | null;
  updatedAt: Date;
}

// BranchStockThreshold - نفس مفهوم reorder_point/min_stock/max_stock لكل (فرع، صنف) في الريبو القديم.
// كله اختياري (null افتراضيًا) - صنف من غير حدود مضبوطة مش "منخفض" أبدًا (راجع classifyStockLevel)
export class BranchStockThreshold {
  private constructor(private props: BranchStockThresholdProps) {}

  static default(branchId: string, inventoryItemId: string): BranchStockThreshold {
    return new BranchStockThreshold({
      branchId,
      inventoryItemId,
      reorderPoint: null,
      minStock: null,
      maxStock: null,
      updatedBy: null,
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: BranchStockThresholdProps): BranchStockThreshold {
    return new BranchStockThreshold(props);
  }

  update(input: { reorderPoint?: number | null; minStock?: number | null; maxStock?: number | null; updatedBy: string | null }): void {
    for (const value of [input.reorderPoint, input.minStock, input.maxStock]) {
      if (value !== undefined && value !== null && value < 0) throw new NegativeStockThresholdError();
    }
    if (input.reorderPoint !== undefined) this.props.reorderPoint = input.reorderPoint;
    if (input.minStock !== undefined) this.props.minStock = input.minStock;
    if (input.maxStock !== undefined) this.props.maxStock = input.maxStock;
    this.props.updatedBy = input.updatedBy;
    this.props.updatedAt = new Date();
  }

  get branchId(): string { return this.props.branchId; }
  get inventoryItemId(): string { return this.props.inventoryItemId; }
  get reorderPoint(): number | null { return this.props.reorderPoint; }
  get minStock(): number | null { return this.props.minStock; }
  get maxStock(): number | null { return this.props.maxStock; }
  get updatedBy(): string | null { return this.props.updatedBy; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
