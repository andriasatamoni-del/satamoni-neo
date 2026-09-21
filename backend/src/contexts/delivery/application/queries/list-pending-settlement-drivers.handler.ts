import { Inject, Injectable } from "@nestjs/common";
import { DRIVER_SETTLEMENT_READER, type DriverSettlementReaderPort, type PendingSettlementDriver } from "../../domain/ports/driver-settlement-reader.port";

@Injectable()
export class ListPendingSettlementDriversHandler {
  constructor(@Inject(DRIVER_SETTLEMENT_READER) private readonly reader: DriverSettlementReaderPort) {}

  async execute(branchId: string): Promise<PendingSettlementDriver[]> {
    return this.reader.listPendingDrivers(branchId);
  }
}
