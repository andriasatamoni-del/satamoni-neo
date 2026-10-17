import { Inject, Injectable } from "@nestjs/common";
import { Driver } from "../../domain/driver.aggregate";
import { DRIVER_REPOSITORY, type DriverListFilter, type DriverRepositoryPort } from "../../domain/ports/driver-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListDriversHandler {
  constructor(@Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepositoryPort) {}

  async execute(filter: DriverListFilter = {}, page?: PageRequest): Promise<{ drivers: Driver[]; total: number }> {
    return this.drivers.search(filter, page);
  }
}
