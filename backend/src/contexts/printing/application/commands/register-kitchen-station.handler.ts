import { Inject, Injectable } from "@nestjs/common";
import { KitchenStation } from "../../domain/kitchen-station.aggregate";
import { KITCHEN_STATION_REPOSITORY, type KitchenStationRepositoryPort } from "../../domain/ports/kitchen-station-repository.port";
import { PRINTER_REPOSITORY, type PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";
import { PrinterBranchMismatchError } from "../../domain/errors";

export interface RegisterKitchenStationCommand {
  branchId: string;
  name: string;
  printerId?: string | null;
}

@Injectable()
export class RegisterKitchenStationHandler {
  constructor(
    @Inject(KITCHEN_STATION_REPOSITORY) private readonly stations: KitchenStationRepositoryPort,
    @Inject(PRINTER_REPOSITORY) private readonly printers: PrinterRepositoryPort
  ) {}

  async execute(command: RegisterKitchenStationCommand): Promise<KitchenStation> {
    if (command.printerId) {
      const printer = await this.printers.findById(command.printerId);
      if (!printer || printer.branchId !== command.branchId) throw new PrinterBranchMismatchError();
    }
    const station = KitchenStation.register(command);
    await this.stations.save(station);
    return station;
  }
}
