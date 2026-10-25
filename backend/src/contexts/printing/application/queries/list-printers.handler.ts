import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { PRINTER_REPOSITORY, type PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";
import type { Printer } from "../../domain/printer.aggregate";

@Injectable()
export class ListPrintersHandler {
  constructor(@Inject(PRINTER_REPOSITORY) private readonly printers: PrinterRepositoryPort) {}

  execute(branchId: string, page?: PageRequest): Promise<{ rows: Printer[]; total: number }> {
    return this.printers.listByBranchPage(branchId, page);
  }
}
