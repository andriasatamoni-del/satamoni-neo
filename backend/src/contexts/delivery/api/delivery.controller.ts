import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterDriverHandler } from "../application/commands/register-driver.handler";
import { AssignDriverHandler } from "../application/commands/assign-driver.handler";
import { UpdateDeliveryStatusHandler } from "../application/commands/update-delivery-status.handler";
import { ListDriversHandler } from "../application/queries/list-drivers.handler";
import { ListDeliveryAssignmentsHandler } from "../application/queries/list-delivery-assignments.handler";
import { RegisterDriverDto } from "./dto/register-driver.dto";
import { AssignDriverDto } from "./dto/assign-driver.dto";
import { UpdateDeliveryStatusDto } from "./dto/update-delivery-status.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { DeliveryDomainErrorFilter } from "./filters/domain-error.filter";
import type { Driver } from "../domain/driver.aggregate";
import type { DeliveryAssignment } from "../domain/delivery-assignment.aggregate";

@Controller("delivery")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(DeliveryDomainErrorFilter)
export class DeliveryController {
  constructor(
    private readonly registerDriver: RegisterDriverHandler,
    private readonly assignDriver: AssignDriverHandler,
    private readonly updateDeliveryStatus: UpdateDeliveryStatusHandler,
    private readonly listDrivers: ListDriversHandler,
    private readonly listAssignments: ListDeliveryAssignmentsHandler
  ) {}

  @Get("drivers")
  @RequirePermission("delivery.drivers.view", "delivery.drivers.manage")
  async drivers(@Query("branchId") branchId?: string) {
    return (await this.listDrivers.execute(branchId ? { branchId } : undefined)).map(toPublicDriver);
  }

  @Post("drivers")
  @RequirePermission("delivery.drivers.manage")
  async createDriver(@Body() dto: RegisterDriverDto) {
    return toPublicDriver(await this.registerDriver.execute(dto));
  }

  @Get("assignments")
  @RequirePermission("delivery.assignments.view", "delivery.assignments.manage")
  async assignments(@Query("branchId") branchId?: string, @Query("driverId") driverId?: string) {
    return (await this.listAssignments.execute({ branchId, driverId })).map(toPublicAssignment);
  }

  @Post("assignments")
  @RequirePermission("delivery.assignments.manage")
  async createAssignment(@Body() dto: AssignDriverDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicAssignment(await this.assignDriver.execute({ ...dto, assignedBy: req.user.id }));
  }

  @Patch("assignments/:id/status")
  @RequirePermission("delivery.assignments.manage")
  async updateStatus(@Param("id") id: string, @Body() dto: UpdateDeliveryStatusDto) {
    return toPublicAssignment(await this.updateDeliveryStatus.execute({ assignmentId: id, ...dto }));
  }
}

function toPublicDriver(driver: Driver) {
  return { id: driver.id, name: driver.name, phone: driver.phone, branchId: driver.branchId, status: driver.status };
}

function toPublicAssignment(assignment: DeliveryAssignment) {
  return {
    id: assignment.id,
    orderId: assignment.orderId,
    driverId: assignment.driverId,
    branchId: assignment.branchId,
    status: assignment.status,
    assignedAt: assignment.assignedAt,
    deliveredAt: assignment.deliveredAt,
    failureReason: assignment.failureReason,
  };
}
