import { randomUUID } from "node:crypto";
import { InvalidProductMappingError } from "./errors";

export interface TalabatProductMappingProps {
  branchId: string;
  talabatItemId: string;
  menuItemId: string | null;
  variantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// TalabatProductMapping - talabat_item_id -> (menuItemId+variantId) حقيقي لكل فرع (نفس صنف Talabat
// ممكن يتحل لحجم مختلف حسب الفرع). صنف من غير mapping هنا وقت المزامنة = MAPPING_ERROR مرئي دايمًا،
// مش تجاهل صامت (نفس فلسفة talabat_product_mapping بالريبو القديم بالظبط).
export class TalabatProductMapping {
  private constructor(
    public readonly id: string,
    private props: TalabatProductMappingProps
  ) {}

  static register(input: { branchId: string; talabatItemId: string; menuItemId: string; variantId: string }): TalabatProductMapping {
    const talabatItemId = input.talabatItemId.trim();
    if (!talabatItemId) throw new InvalidProductMappingError();
    const now = new Date();
    return new TalabatProductMapping(randomUUID(), {
      branchId: input.branchId,
      talabatItemId,
      menuItemId: input.menuItemId,
      variantId: input.variantId,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(id: string, props: TalabatProductMappingProps): TalabatProductMapping {
    return new TalabatProductMapping(id, props);
  }

  relink(input: { menuItemId: string; variantId: string }): void {
    this.props.menuItemId = input.menuItemId;
    this.props.variantId = input.variantId;
    this.props.updatedAt = new Date();
  }

  get branchId(): string { return this.props.branchId; }
  get talabatItemId(): string { return this.props.talabatItemId; }
  get menuItemId(): string | null { return this.props.menuItemId; }
  get variantId(): string | null { return this.props.variantId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
