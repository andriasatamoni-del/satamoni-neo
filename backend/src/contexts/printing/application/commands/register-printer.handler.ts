import { Inject, Injectable } from "@nestjs/common";
import { Printer } from "../../domain/printer.aggregate";
import { PRINTER_REPOSITORY, type PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";

export interface RegisterPrinterCommand {
  branchId: string;
  name: string;
  printerType: string;
  connectionType?: string;
  osPrinterName?: string | null;
  ipAddress?: string | null;
  port?: number | null;
  paperWidthMm?: number;
}

@Injectable()
export class RegisterPrinterHandler {
  constructor(@Inject(PRINTER_REPOSITORY) private readonly printers: PrinterRepositoryPort) {}

  async execute(command: RegisterPrinterCommand): Promise<Printer> {
    const printer = Printer.register(command);
    await this.printers.save(printer);
    return printer;
  }
}
