import { Inject, Injectable } from "@nestjs/common";
import { Driver } from "../../domain/driver.aggregate";
import { DRIVER_REPOSITORY, type DriverRepositoryPort } from "../../domain/ports/driver-repository.port";

@Injectable()
export class ListDriversHandler {
  constructor(@Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepositoryPort) {}

  async execute(filter?: { branchId?: string }): Promise<Driver[]> {
    return this.drivers.list(filter);
  }
}
