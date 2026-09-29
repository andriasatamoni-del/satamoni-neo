import { Inject, Injectable } from "@nestjs/common";
import { STOREFRONT_READER, type StorefrontReaderPort } from "../../domain/ports/storefront-reader.port";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";

// GET /storefront/menu - نفس /api/config/full بتاع public/order.html في الريبو القديم: المنيو + الفروع +
// هل الطلب مفتوح. الدفع: كاش عند الاستلام بس (الدفع أونلاين كان "قريبًا" في القديم برضه)
@Injectable()
export class GetStorefrontMenuHandler {
  constructor(
    @Inject(STOREFRONT_READER) private readonly reader: StorefrontReaderPort,
    private readonly settings: GetPosSettingsHandler
  ) {}

  async execute() {
    const [settings, branches, categories, combos] = await Promise.all([
      this.settings.execute(),
      this.reader.branches(),
      this.reader.categories(),
      this.reader.combos(),
    ]);
    return {
      orderingEnabled: settings.onlineOrderingEnabled,
      paymentMethods: [{ key: "cash", label: "كاش عند الاستلام" }],
      branches,
      categories,
      combos,
    };
  }
}
