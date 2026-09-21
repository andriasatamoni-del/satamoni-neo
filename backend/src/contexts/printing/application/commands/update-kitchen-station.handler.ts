import { Inject, Injectable } from "@nestjs/common";
import { KitchenStation } from "../../domain/kitchen-station.aggregate";
import { KITCHEN_STATION_REPOSITORY, type KitchenStationRepositoryPort } from "../../domain/ports/kitchen-station-repository.port";
import { PRINTER_REPOSITORY, type PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";
import { KitchenStationNotFoundError, PrinterBranchMismatchError } from "../../domain/errors";

export interface UpdateKitchenStationCommand {
  stationId: string;
  name?: string;
  printerId?: string | null;
  isActive?: boolean;
}

@Injectable()
export class UpdateKitchenStationHandler {
  constructor(
    @Inject(KITCHEN_STATION_REPOSITORY) private readonly stations: KitchenStationRepositoryPort,
    @Inject(PRINTER_REPOSITORY) private readonly printers: PrinterRepositoryPort
  ) {}

  async execute(command: UpdateKitchenStationCommand): Promise<KitchenStation> {
    const station = await this.stations.findById(command.stationId);
    if (!station) throw new KitchenStationNotFoundError();
    if (command.printerId) {
      const printer = await this.printers.findById(command.printerId);
      if (!printer || printer.branchId !== station.branchId) throw new PrinterBranchMismatchError();
    }
    station.update(command);
    await this.stations.save(station);
    return station;
  }
}
