import { Inject, Injectable } from "@nestjs/common";
import { DRIVER_SETTLEMENT_READER, type DriverDayOrdersReport, type DriverSettlementReaderPort } from "../../domain/ports/driver-settlement-reader.port";

@Injectable()
export class GetDriverDayOrdersHandler {
  constructor(@Inject(DRIVER_SETTLEMENT_READER) private readonly reader: DriverSettlementReaderPort) {}

  async execute(driverId: string, date?: string): Promise<DriverDayOrdersReport> {
    return this.reader.getDriverDayOrders(driverId, date);
  }
}
