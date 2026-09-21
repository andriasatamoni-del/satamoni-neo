import { Inject, Injectable } from "@nestjs/common";
import { KITCHEN_STATION_REPOSITORY, type KitchenStationRepositoryPort } from "../../domain/ports/kitchen-station-repository.port";
import { PRINTER_REPOSITORY, type PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";
import type { KitchenStation } from "../../domain/kitchen-station.aggregate";

export interface KitchenStationView {
  id: string;
  branchId: string;
  name: string;
  printerId: string | null;
  printerName: string | null;
  isActive: boolean;
}

// قايمة محطات الفرع مع اسم الطابعة المربوطة (لو موجودة) - شاشة الإدارة محتاجاها عشان تعرض "المحطة X
// مربوطة بطابعة Y" من غير ما تعمل استعلام تاني بنفسها
@Injectable()
export class ListKitchenStationsHandler {
  constructor(
    @Inject(KITCHEN_STATION_REPOSITORY) private readonly stations: KitchenStationRepositoryPort,
    @Inject(PRINTER_REPOSITORY) private readonly printers: PrinterRepositoryPort
  ) {}

  async execute(branchId: string): Promise<KitchenStationView[]> {
    const branchStations: KitchenStation[] = await this.stations.listByBranch(branchId);
    const views: KitchenStationView[] = [];
    for (const station of branchStations) {
      const printer = station.printerId ? await this.printers.findById(station.printerId) : null;
      views.push({
        id: station.id, branchId: station.branchId, name: station.name,
        printerId: station.printerId, printerName: printer?.name ?? null, isActive: station.isActive,
      });
    }
    return views;
  }
}
