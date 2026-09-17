import { Body, Controller, Get, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterConversionOrderHandler } from "../application/commands/register-conversion-order.handler";
import { ApproveConversionOrderHandler } from "../application/commands/approve-conversion-order.handler";
import { StartConversionOrderHandler } from "../application/commands/start-conversion-order.handler";
import { CompleteConversionOrderHandler } from "../application/commands/complete-conversion-order.handler";
import { CancelConversionOrderHandler } from "../application/commands/cancel-conversion-order.handler";
import { ListConversionOrdersHandler } from "../application/queries/list-conversion-orders.handler";
import { GetConversionOrderHandler } from "../application/queries/get-conversion-order.handler";
import { RegisterConversionOrderDto } from "./dto/register-conversion-order.dto";
import { StartConversionOrderDto } from "./dto/start-conversion-order.dto";
import { CompleteConversionOrderDto } from "./dto/complete-conversion-order.dto";
import { CancelConversionOrderDto } from "./dto/cancel-conversion-order.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { ProductionDomainErrorFilter } from "./filters/domain-error.filter";
import type { ConversionOrder } from "../domain/conversion-order.aggregate";

@Controller("production")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(ProductionDomainErrorFilter)
export class ProductionController {
  constructor(
    private readonly registerConversionOrder: RegisterConversionOrderHandler,
    private readonly approveConversionOrder: ApproveConversionOrderHandler,
    private readonly startConversionOrder: StartConversionOrderHandler,
    private readonly completeConversionOrder: CompleteConversionOrderHandler,
    private readonly cancelConversionOrder: CancelConversionOrderHandler,
    private readonly listConversionOrders: ListConversionOrdersHandler,
    private readonly getConversionOrder: GetConversionOrderHandler
  ) {}

  @Get()
  @RequirePermission("production.view")
  async list(@Query("branchId") branchId?: string, @Query("status") status?: string) {
    return (await this.listConversionOrders.execute({ branchId, status })).map(toPublicConversionOrder);
  }

  @Get(":id")
  @RequirePermission("production.view")
  async detail(@Param("id") id: string) {
    return toPublicConversionOrder(await this.getConversionOrder.execute(id));
  }

  @Post()
  @RequirePermission("production.create")
  async create(@Body() dto: RegisterConversionOrderDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicConversionOrder(await this.registerConversionOrder.execute({ ...dto, createdBy: req.user.id }));
  }

  @Post(":id/approve")
  @RequirePermission("production.approve")
  async approve(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicConversionOrder(await this.approveConversionOrder.execute({ conversionOrderId: id, approvedBy: req.user.id }));
  }

  @Post(":id/start")
  @RequirePermission("production.create")
  async start(@Param("id") id: string, @Body() dto: StartConversionOrderDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicConversionOrder(
      await this.startConversionOrder.execute({
        conversionOrderId: id,
        actualConsumption: dto.actualConsumption,
        stockApproved: dto.stockApproved,
        performedBy: req.user.id,
      })
    );
  }

  @Post(":id/complete")
  @RequirePermission("production.complete")
  async complete(@Param("id") id: string, @Body() dto: CompleteConversionOrderDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicConversionOrder(
      await this.completeConversionOrder.execute({
        conversionOrderId: id,
        actualOutputQuantity: dto.actualOutputQuantity,
        varianceReason: dto.varianceReason,
        completedBy: req.user.id,
      })
    );
  }

  @Post(":id/cancel")
  @RequirePermission("production.cancel")
  async cancel(@Param("id") id: string, @Body() dto: CancelConversionOrderDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicConversionOrder(
      await this.cancelConversionOrder.execute({ conversionOrderId: id, cancelledBy: req.user.id, reason: dto.reason })
    );
  }
}

function toPublicConversionOrder(order: ConversionOrder) {
  return {
    id: order.id,
    branchId: order.branchId,
    recipeId: order.recipeId,
    recipeVersionId: order.recipeVersionId,
    outputItemId: order.outputItemId,
    status: order.status,
    plannedOutputQuantity: order.plannedOutputQuantity,
    actualOutputQuantity: order.actualOutputQuantity,
    outputUnitCost: order.outputUnitCost,
    varianceReason: order.varianceReason,
    notes: order.notes,
    inputLines: order.inputLines.map((l) => ({
      ingredientItemId: l.ingredientItemId,
      plannedQuantityPerUnit: l.plannedQuantityPerUnit,
      plannedQuantity: l.plannedQuantity,
      actualQuantity: l.actualQuantity,
      unitCost: l.unitCost,
    })),
    approvedAt: order.approvedAt,
    startedAt: order.startedAt,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
  };
}
