import { Inject, Injectable } from "@nestjs/common";
import { TalabatProductMapping } from "../../domain/talabat-product-mapping.aggregate";
import {
  TALABAT_PRODUCT_MAPPING_REPOSITORY,
  type TalabatProductMappingRepositoryPort,
} from "../../domain/ports/talabat-product-mapping-repository.port";

@Injectable()
export class ListProductMappingsHandler {
  constructor(@Inject(TALABAT_PRODUCT_MAPPING_REPOSITORY) private readonly mappings: TalabatProductMappingRepositoryPort) {}

  async execute(branchId: string): Promise<TalabatProductMapping[]> {
    return this.mappings.listByBranch(branchId);
  }
}
