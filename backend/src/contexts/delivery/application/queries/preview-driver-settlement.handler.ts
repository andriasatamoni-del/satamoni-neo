import { Inject, Injectable } from "@nestjs/common";
import { DRIVER_REPOSITORY, type DriverRepositoryPort } from "../../domain/ports/driver-repository.port";
import { DRIVER_SETTLEMENT_READER, type DriverSettlementPreview, type DriverSettlementReaderPort } from "../../domain/ports/driver-settlement-reader.port";
import { DriverNotFoundError } from "../../domain/errors";

@Injectable()
export class PreviewDriverSettlementHandler {
  constructor(
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepositoryPort,
    @Inject(DRIVER_SETTLEMENT_READER) private readonly reader: DriverSettlementReaderPort
  ) {}

  async execute(driverId: string): Promise<DriverSettlementPreview> {
    if (!(await this.drivers.findById(driverId))) throw new DriverNotFoundError();
    return this.reader.previewUnsettled(driverId);
  }
}
