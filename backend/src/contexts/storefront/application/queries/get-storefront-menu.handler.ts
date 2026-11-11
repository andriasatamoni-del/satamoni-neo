import { Inject, Injectable } from "@nestjs/common";
import { STOREFRONT_READER, type StorefrontReaderPort } from "../../domain/ports/storefront-reader.port";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";
import { ListLoyaltyRewardsHandler } from "../../../loyalty/application/queries/list-loyalty-rewards.handler";

@Injectable()
export class GetStorefrontMenuHandler {
  constructor(
    @Inject(STOREFRONT_READER) private readonly reader: StorefrontReaderPort,
    private readonly settings: GetPosSettingsHandler,
    private readonly rewards: ListLoyaltyRewardsHandler
  ) {}

  async execute() {
    const [settings, branches, categories, addons, combos, rewards] = await Promise.all([
      this.settings.execute(),
      this.reader.branches(),
      this.reader.categories(),
      this.reader.addons(),
      this.reader.combos(),
      this.rewards.execute({ activeOnly: true }),
    ]);
    return {
      orderingEnabled: settings.onlineOrderingEnabled,
      paymentMethods: [{ key: "cash", label: "كاش عند الاستلام" }],
      branches,
      categories,
      addons,
      combos,
      loyalty: { pointsPerEgp: settings.loyaltyPointsPerEgp, rewards },
    };
  }
}
