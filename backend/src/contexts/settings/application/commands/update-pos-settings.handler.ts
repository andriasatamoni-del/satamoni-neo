import { Inject, Injectable } from "@nestjs/common";
import { PosSettings } from "../../domain/pos-settings.aggregate";
import { POS_SETTINGS_REPOSITORY, type PosSettingsRepositoryPort } from "../../domain/ports/pos-settings-repository.port";

export interface UpdatePosSettingsCommand {
  shiftVarianceAckThresholdEgp?: number;
  driverSettlementVarianceAckThresholdEgp?: number;
  driverHourlyRateEgp?: number;
  paymentAdjustmentHighThresholdEgp?: number;
  productionVarianceAlertPercent?: number;
  updatedBy: string | null;
}

@Injectable()
export class UpdatePosSettingsHandler {
  constructor(@Inject(POS_SETTINGS_REPOSITORY) private readonly settings: PosSettingsRepositoryPort) {}

  async execute(command: UpdatePosSettingsCommand): Promise<PosSettings> {
    const current = await this.settings.get();
    current.update(command, command.updatedBy);
    await this.settings.save(current);
    return current;
  }
}
