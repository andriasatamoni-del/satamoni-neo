import { Inject, Injectable } from "@nestjs/common";
import { Driver } from "../../domain/driver.aggregate";
import { DRIVER_REPOSITORY, type DriverRepositoryPort } from "../../domain/ports/driver-repository.port";

export interface RegisterDriverCommand {
  name: string;
  phone?: string | null;
  branchId: string;
}

@Injectable()
export class RegisterDriverHandler {
  constructor(@Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepositoryPort) {}

  async execute(command: RegisterDriverCommand): Promise<Driver> {
    const driver = Driver.register(command);
    await this.drivers.save(driver);
    return driver;
  }
}
