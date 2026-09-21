import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterKitchenStationHandler } from "../application/commands/register-kitchen-station.handler";
import { UpdateKitchenStationHandler } from "../application/commands/update-kitchen-station.handler";
import { DeleteKitchenStationHandler } from "../application/commands/delete-kitchen-station.handler";
import { RouteMenuCategoryHandler } from "../application/commands/route-menu-category.handler";
import { RouteMenuItemHandler } from "../application/commands/route-menu-item.handler";
import { ListKitchenStationsHandler } from "../application/queries/list-kitchen-stations.handler";
import { GetMenuRoutingHandler } from "../application/queries/get-menu-routing.handler";
import { RegisterKitchenStationDto, UpdateKitchenStationDto, RouteStationDto } from "./dto/kitchen-station.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { PrintingDomainErrorFilter } from "./filters/domain-error.filter";
import type { KitchenStation } from "../domain/kitchen-station.aggregate";

function toPublicStation(station: KitchenStation) {
  return { id: station.id, branchId: station.branchId, name: station.name, printerId: station.printerId, isActive: station.isActive };
}

@Controller("printing/kitchen-stations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(PrintingDomainErrorFilter)
export class KitchenStationsController {
  constructor(
    private readonly registerStation: RegisterKitchenStationHandler,
    private readonly updateStation: UpdateKitchenStationHandler,
    private readonly deleteStation: DeleteKitchenStationHandler,
    private readonly routeMenuCategory: RouteMenuCategoryHandler,
    private readonly routeMenuItem: RouteMenuItemHandler,
    private readonly listStations: ListKitchenStationsHandler,
    private readonly getMenuRouting: GetMenuRoutingHandler
  ) {}

  @Get()
  @RequirePermission("print_routing.view", "print_routing.manage")
  async list(@Query("branchId") branchId: string | undefined, @Req() req: Request & { user: AuthenticatedUser }) {
    const effectiveBranchId = branchId || req.user.branchId;
    if (!effectiveBranchId) return [];
    return this.listStations.execute(effectiveBranchId);
  }

  @Get("routing/menu")
  @RequirePermission("print_routing.view", "print_routing.manage")
  async menuRouting() {
    return this.getMenuRouting.execute();
  }

  @Post()
  @RequirePermission("print_routing.manage")
  async create(@Body() dto: RegisterKitchenStationDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const branchId = dto.branchId || req.user.branchId;
    if (!branchId) return { error: "لازم تحدد الفرع" };
    return toPublicStation(await this.registerStation.execute({ ...dto, branchId }));
  }

  @Patch("routing/menu-categories/:id")
  @RequirePermission("print_routing.manage")
  async routeCategory(@Param("id") id: string, @Body() dto: RouteStationDto) {
    const category = await this.routeMenuCategory.execute({ categoryId: id, stationId: dto.stationId ?? null });
    return { categoryId: category.id, stationId: category.stationId };
  }

  @Patch("routing/menu-items/:id")
  @RequirePermission("print_routing.manage")
  async routeItem(@Param("id") id: string, @Body() dto: RouteStationDto) {
    const item = await this.routeMenuItem.execute({ itemId: id, stationId: dto.stationId ?? null });
    return { itemId: item.id, stationId: item.stationId };
  }

  @Patch(":id")
  @RequirePermission("print_routing.manage")
  async update(@Param("id") id: string, @Body() dto: UpdateKitchenStationDto) {
    return toPublicStation(await this.updateStation.execute({ stationId: id, ...dto }));
  }

  @Delete(":id")
  @RequirePermission("print_routing.manage")
  async remove(@Param("id") id: string) {
    await this.deleteStation.execute({ stationId: id });
    return { success: true };
  }
}
