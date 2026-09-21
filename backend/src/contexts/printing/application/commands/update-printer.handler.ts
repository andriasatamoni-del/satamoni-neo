import { Inject, Injectable } from "@nestjs/common";
import { Printer } from "../../domain/printer.aggregate";
import { PRINTER_REPOSITORY, type PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";
import { PrinterNotFoundError } from "../../domain/errors";

export interface UpdatePrinterCommand {
  printerId: string;
  name?: string;
  printerType?: string;
  connectionType?: string;
  osPrinterName?: string | null;
  ipAddress?: string | null;
  port?: number | null;
  paperWidthMm?: number;
  isEnabled?: boolean;
  isDefaultForType?: boolean;
}

@Injectable()
export class UpdatePrinterHandler {
  constructor(@Inject(PRINTER_REPOSITORY) private readonly printers: PrinterRepositoryPort) {}

  async execute(command: UpdatePrinterCommand): Promise<Printer> {
    const printer = await this.printers.findById(command.printerId);
    if (!printer) throw new PrinterNotFoundError();

    // "افتراضية للنوع" لازم تكون فريدة (زرار راديو) - لو بنفعّلها هنا، أي طابعة تانية من نفس النوع في
    // نفس الفرع لازم تترجع FALSE أوتوماتيك، غير كده resolveForType هيفضل ياخد أقدم طابعة افتراضية مش
    // اللي المستخدم قصده فعليًا دلوقتي
    if (command.isDefaultForType === true) {
      const type = command.printerType ?? printer.printerType;
      const siblings = await this.printers.listByBranch(printer.branchId);
      for (const sibling of siblings) {
        if (sibling.id !== printer.id && sibling.printerType === type && sibling.isDefaultForType) {
          sibling.clearDefaultForType();
          await this.printers.save(sibling);
        }
      }
    }

    printer.update(command);
    await this.printers.save(printer);
    return printer;
  }
}
