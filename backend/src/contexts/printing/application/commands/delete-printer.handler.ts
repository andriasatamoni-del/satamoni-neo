import { Inject, Injectable } from "@nestjs/common";
import { PRINTER_REPOSITORY, type PrinterRepositoryPort } from "../../domain/ports/printer-repository.port";
import { PrinterNotFoundError } from "../../domain/errors";

export interface DeletePrinterCommand {
  printerId: string;
}

// حذف نهائي - أي محطة/توجيه كان بيشاور على الطابعة دي بيرجع "بدون طابعة" تلقائي (ON DELETE SET NULL)،
// مش بيتمنع (نفس قرار الريبو القديم بالظبط: متوقع ومقصود، يحتاج إعادة ربط بس)
@Injectable()
export class DeletePrinterHandler {
  constructor(@Inject(PRINTER_REPOSITORY) private readonly printers: PrinterRepositoryPort) {}

  async execute(command: DeletePrinterCommand): Promise<void> {
    const printer = await this.printers.findById(command.printerId);
    if (!printer) throw new PrinterNotFoundError();
    await this.printers.delete(command.printerId);
  }
}
