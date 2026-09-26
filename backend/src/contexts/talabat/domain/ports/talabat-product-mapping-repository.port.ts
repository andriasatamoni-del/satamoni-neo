import type { TalabatProductMapping } from "../talabat-product-mapping.aggregate";

export interface TalabatProductMappingRepositoryPort {
  save(mapping: TalabatProductMapping): Promise<void>;
  findByBranchAndTalabatItemId(branchId: string, talabatItemId: string): Promise<TalabatProductMapping | null>;
  listByBranch(branchId: string): Promise<TalabatProductMapping[]>;
}

export const TALABAT_PRODUCT_MAPPING_REPOSITORY = Symbol("TALABAT_PRODUCT_MAPPING_REPOSITORY");
