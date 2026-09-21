import { Inject, Injectable } from "@nestjs/common";
import { KITCHEN_STATION_REPOSITORY, type KitchenStationRepositoryPort } from "../../domain/ports/kitchen-station-repository.port";
import { KitchenStationNotFoundError } from "../../domain/errors";

export interface DeleteKitchenStationCommand {
  stationId: string;
}

// حذف - الأصناف/الأقسام المربوطة بيها بترجع stationId = NULL تلقائي (ON DELETE SET NULL)
@Injectable()
export class DeleteKitchenStationHandler {
  constructor(@Inject(KITCHEN_STATION_REPOSITORY) private readonly stations: KitchenStationRepositoryPort) {}

  async execute(command: DeleteKitchenStationCommand): Promise<void> {
    const station = await this.stations.findById(command.stationId);
    if (!station) throw new KitchenStationNotFoundError();
    await this.stations.delete(command.stationId);
  }
}
