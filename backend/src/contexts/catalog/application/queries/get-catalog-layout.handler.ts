import { Inject, Injectable } from "@nestjs/common";
import { CATALOG_LAYOUT_REPOSITORY, type CatalogLayoutRepositoryPort } from "../../domain/ports/menu-category-repository.port";

// مكان تبويب "العروض" وسط الأقسام. مفيش قيمة محفوظة = الأول (-1 قبل أي قسم)، زي ما العروض كانت بتظهر قبل كده.
@Injectable()
export class GetCatalogLayoutHandler {
  constructor(@Inject(CATALOG_LAYOUT_REPOSITORY) private readonly layout: CatalogLayoutRepositoryPort) {}

  async execute(): Promise<{ combosPosition: number }> {
    return { combosPosition: (await this.layout.getCombosPosition()) ?? -1 };
  }
}
