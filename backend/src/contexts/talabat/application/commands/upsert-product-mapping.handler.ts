import { Inject, Injectable } from "@nestjs/common";
import { TalabatProductMapping } from "../../domain/talabat-product-mapping.aggregate";
import {
  TALABAT_PRODUCT_MAPPING_REPOSITORY,
  type TalabatProductMappingRepositoryPort,
} from "../../domain/ports/talabat-product-mapping-repository.port";

export interface UpsertProductMappingCommand {
  branchId: string;
  talabatItemId: string;
  menuItemId: string;
  variantId: string;
}

// إدارة الربط - talabat_item_id -> (menuItemId+variantId) لكل فرع. تسجيل تاني بنفس (branchId,
// talabatItemId) بيحدّث الربط الموجود مش يكرره (UNIQUE constraint على مستوى القاعدة، راجع migration
// 044 - uq_talabat_product_mapping_branch_item).
@Injectable()
export class UpsertProductMappingHandler {
  constructor(@Inject(TALABAT_PRODUCT_MAPPING_REPOSITORY) private readonly mappings: TalabatProductMappingRepositoryPort) {}

  async execute(command: UpsertProductMappingCommand): Promise<TalabatProductMapping> {
    const existing = await this.mappings.findByBranchAndTalabatItemId(command.branchId, command.talabatItemId);
    if (existing) {
      existing.relink({ menuItemId: command.menuItemId, variantId: command.variantId });
      await this.mappings.save(existing);
      return existing;
    }

    const mapping = TalabatProductMapping.register(command);
    await this.mappings.save(mapping);
    return mapping;
  }
}
