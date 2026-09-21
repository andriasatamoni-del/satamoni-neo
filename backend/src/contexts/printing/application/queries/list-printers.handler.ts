import { Inject, Injectable } from "@nestjs/common";
import { PRINTER_REPOSITORY, type PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";
import type { Printer } from "../../domain/printer.aggregate";

@Injectable()
export class ListPrintersHandler {
  constructor(@Inject(PRINTER_REPOSITORY) private readonly printers: PrinterRepositoryPort) {}

  execute(branchId: string): Promise<Printer[]> {
    return this.printers.listByBranch(branchId);
  }
}
