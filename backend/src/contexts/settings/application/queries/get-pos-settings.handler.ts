import { Inject, Injectable } from "@nestjs/common";
import { PosSettings } from "../../domain/pos-settings.aggregate";
import { POS_SETTINGS_REPOSITORY, type PosSettingsRepositoryPort } from "../../domain/ports/pos-settings-repository.port";

@Injectable()
export class GetPosSettingsHandler {
  constructor(@Inject(POS_SETTINGS_REPOSITORY) private readonly settings: PosSettingsRepositoryPort) {}

  async execute(): Promise<PosSettings> {
    return this.settings.get();
  }
}
