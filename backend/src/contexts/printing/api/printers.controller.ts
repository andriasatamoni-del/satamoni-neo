import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterPrinterHandler } from "../application/commands/register-printer.handler";
import { UpdatePrinterHandler } from "../application/commands/update-printer.handler";
import { DeletePrinterHandler } from "../application/commands/delete-printer.handler";
import { QueueTestPrintHandler } from "../application/commands/queue-test-print.handler";
import { ListPrintersHandler } from "../application/queries/list-printers.handler";
import { RegisterPrinterDto } from "./dto/register-printer.dto";
import { UpdatePrinterDto } from "./dto/update-printer.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { PrintingDomainErrorFilter } from "./filters/domain-error.filter";
import type { Printer } from "../domain/printer.aggregate";

function toPublicPrinter(printer: Printer) {
  return {
    id: printer.id,
    branchId: printer.branchId,
    name: printer.name,
    printerType: printer.printerType,
    connectionType: printer.connectionType,
    osPrinterName: printer.osPrinterName,
    ipAddress: printer.ipAddress,
    port: printer.port,
    paperWidthMm: printer.paperWidthMm,
    isEnabled: printer.isEnabled,
    isDefaultForType: printer.isDefaultForType,
  };
}

@Controller("printing/printers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(PrintingDomainErrorFilter)
export class PrintersController {
  constructor(
    private readonly registerPrinter: RegisterPrinterHandler,
    private readonly updatePrinter: UpdatePrinterHandler,
    private readonly deletePrinter: DeletePrinterHandler,
    private readonly queueTestPrint: QueueTestPrintHandler,
    private readonly listPrinters: ListPrintersHandler
  ) {}

  @Get()
  @RequirePermission("printers.view", "printers.manage")
  async list(@Query("branchId") branchId: string | undefined, @Req() req: Request & { user: AuthenticatedUser }) {
    const effectiveBranchId = branchId || req.user.branchId;
    if (!effectiveBranchId) return [];
    return (await this.listPrinters.execute(effectiveBranchId)).map(toPublicPrinter);
  }

  @Post()
  @RequirePermission("printers.manage")
  async create(@Body() dto: RegisterPrinterDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const branchId = dto.branchId || req.user.branchId;
    if (!branchId) return { error: "لازم تحدد الفرع" };
    return toPublicPrinter(await this.registerPrinter.execute({ ...dto, branchId }));
  }

  @Patch(":id")
  @RequirePermission("printers.manage")
  async update(@Param("id") id: string, @Body() dto: UpdatePrinterDto) {
    return toPublicPrinter(await this.updatePrinter.execute({ printerId: id, ...dto }));
  }

  @Delete(":id")
  @RequirePermission("printers.manage")
  async remove(@Param("id") id: string) {
    await this.deletePrinter.execute({ printerId: id });
    return { success: true };
  }

  @Post(":id/test-print")
  @RequirePermission("printers.manage")
  async testPrint(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    const job = await this.queueTestPrint.execute({ printerId: id, createdBy: req.user.id });
    return { id: job.id, status: job.status };
  }
}
