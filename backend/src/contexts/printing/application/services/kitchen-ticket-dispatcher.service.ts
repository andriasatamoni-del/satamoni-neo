import { Inject, Injectable } from "@nestjs/common";
import { KITCHEN_STATION_REPOSITORY, type KitchenStationRepositoryPort } from "../../domain/ports/kitchen-station-repository.port";
import { PrintJobQueuer } from "./print-job-queuer.service";
import { buildKitchenTicket, type PrintOrderSummary, type PrintItemLine } from "../../infrastructure/print-templates";
import { splitItemsByStation, type ResolvedPrintItem } from "./order-print-data.builder";
import type { PrintJob } from "../../domain/print-job.aggregate";

// بتطبع تذكرة لكل محطة تحضير ظهرت فعليًا في الطلب - بتنادى من تيك أواي/دليفري وقت الإنشاء، ومن الصالة
// وقت ما kitchen_status توصل PREPARING (نفس القرار بالظبط بتاع db/print-queue.js:
// queueKitchenTicketsByStation)
@Injectable()
export class KitchenTicketDispatcher {
  constructor(
    @Inject(KITCHEN_STATION_REPOSITORY) private readonly stations: KitchenStationRepositoryPort,
    private readonly printJobQueuer: PrintJobQueuer
  ) {}

  async dispatch(input: {
    orderId: string;
    branchId: string;
    order: PrintOrderSummary;
    items: ResolvedPrintItem[];
    createdBy?: string | null;
  }): Promise<PrintJob[]> {
    const buckets = splitItemsByStation(input.items);
    const branchStations = await this.stations.listByBranch(input.branchId);
    const stationsById = new Map(branchStations.map((s) => [s.id, s]));

    const jobs: PrintJob[] = [];
    for (const [stationId, stationItems] of buckets) {
      const station = stationId ? (stationsById.get(stationId) ?? null) : null;
      const html = buildKitchenTicket({
        order: input.order,
        items: stationItems as PrintItemLine[],
        stationName: station ? station.name : "غير محدد",
      });
      const job = await this.printJobQueuer.queueForStation({
        orderId: input.orderId,
        branchId: input.branchId,
        station,
        contentHtml: html,
        idempotencyKey: `order:${input.orderId}:type:KITCHEN_TICKET:station:${stationId ?? "none"}`,
        createdBy: input.createdBy,
      });
      jobs.push(job);
    }
    return jobs;
  }
}
