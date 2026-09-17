import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterDriverHandler } from "../application/commands/register-driver.handler";
import { AssignDriverHandler } from "../application/commands/assign-driver.handler";
import { UpdateDeliveryStatusHandler } from "../application/commands/update-delivery-status.handler";
import { RegisterDriverSettlementHandler } from "../application/commands/register-driver-settlement.handler";
import { ReviewDriverSettlementHandler } from "../application/commands/review-driver-settlement.handler";
import { CheckInDriverHandler } from "../application/commands/check-in-driver.handler";
import { CheckOutDriverHandler } from "../application/commands/check-out-driver.handler";
import { ListDriversHandler } from "../application/queries/list-drivers.handler";
import { ListDeliveryAssignmentsHandler } from "../application/queries/list-delivery-assignments.handler";
import { ListDriverSettlementsHandler } from "../application/queries/list-driver-settlements.handler";
import { GetDriverSettlementHandler } from "../application/queries/get-driver-settlement.handler";
import { ListDriverAttendanceShiftsHandler } from "../application/queries/list-driver-attendance-shifts.handler";
import { RegisterDriverDto } from "./dto/register-driver.dto";
import { AssignDriverDto } from "./dto/assign-driver.dto";
import { UpdateDeliveryStatusDto } from "./dto/update-delivery-status.dto";
import { RegisterDriverSettlementDto } from "./dto/register-driver-settlement.dto";
import { ReviewDriverSettlementDto } from "./dto/review-driver-settlement.dto";
import { CheckInDriverDto } from "./dto/check-in-driver.dto";
import { CheckOutDriverDto } from "./dto/check-out-driver.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { DeliveryDomainErrorFilter } from "./filters/domain-error.filter";
import type { Driver } from "../domain/driver.aggregate";
import type { DeliveryAssignment } from "../domain/delivery-assignment.aggregate";
import type { DriverSettlement } from "../domain/driver-settlement.aggregate";
import type { DriverAttendanceShift } from "../domain/driver-attendance-shift.aggregate";

@Controller("delivery")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(DeliveryDomainErrorFilter)
export class DeliveryController {
  constructor(
    private readonly registerDriver: RegisterDriverHandler,
    private readonly assignDriver: AssignDriverHandler,
    private readonly updateDeliveryStatus: UpdateDeliveryStatusHandler,
    private readonly registerDriverSettlement: RegisterDriverSettlementHandler,
    private readonly reviewDriverSettlement: ReviewDriverSettlementHandler,
    private readonly checkInDriver: CheckInDriverHandler,
    private readonly checkOutDriver: CheckOutDriverHandler,
    private readonly listDrivers: ListDriversHandler,
    private readonly listAssignments: ListDeliveryAssignmentsHandler,
    private readonly listDriverSettlements: ListDriverSettlementsHandler,
    private readonly getDriverSettlement: GetDriverSettlementHandler,
    private readonly listDriverAttendanceShifts: ListDriverAttendanceShiftsHandler
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

  @Get("settlements")
  @RequirePermission("delivery.settlements.view", "delivery.settlements.create", "delivery.settlements.review")
  async settlements(@Query("driverId") driverId?: string, @Query("branchId") branchId?: string, @Query("varianceStatus") varianceStatus?: string) {
    return (await this.listDriverSettlements.execute({ driverId, branchId, varianceStatus })).map(toPublicSettlement);
  }

  @Get("settlements/:id")
  @RequirePermission("delivery.settlements.view", "delivery.settlements.create", "delivery.settlements.review")
  async settlement(@Param("id") id: string) {
    return toPublicSettlement(await this.getDriverSettlement.execute(id));
  }

  @Post("settlements")
  @RequirePermission("delivery.settlements.create")
  async createSettlement(@Body() dto: RegisterDriverSettlementDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicSettlement(await this.registerDriverSettlement.execute({ ...dto, settledBy: req.user.id }));
  }

  @Post("settlements/:id/review")
  @RequirePermission("delivery.settlements.review")
  async reviewSettlement(@Param("id") id: string, @Body() dto: ReviewDriverSettlementDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicSettlement(
      await this.reviewDriverSettlement.execute({ settlementId: id, decision: dto.decision, notes: dto.notes, reviewerId: req.user.id })
    );
  }

  @Get("attendance-shifts")
  @RequirePermission("delivery.shifts.manage")
  async attendanceShifts(@Query("branchId") branchId?: string, @Query("driverId") driverId?: string, @Query("status") status?: string) {
    return (await this.listDriverAttendanceShifts.execute({ branchId, driverId, status })).map(toPublicAttendanceShift);
  }

  @Post("attendance-shifts/check-in")
  @RequirePermission("delivery.shifts.manage")
  async checkIn(@Body() dto: CheckInDriverDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicAttendanceShift(await this.checkInDriver.execute({ ...dto, checkedInBy: req.user.id }));
  }

  @Post("attendance-shifts/:id/check-out")
  @RequirePermission("delivery.shifts.manage")
  async checkOut(@Param("id") id: string, @Body() dto: CheckOutDriverDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicAttendanceShift(await this.checkOutDriver.execute({ shiftId: id, checkedOutBy: req.user.id, notes: dto.notes }));
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
    collectedAmount: assignment.collectedAmount,
    settlementId: assignment.settlementId,
  };
}

function toPublicSettlement(settlement: DriverSettlement) {
  return {
    id: settlement.id,
    driverId: settlement.driverId,
    branchId: settlement.branchId,
    settledBy: settlement.settledBy,
    settledAt: settlement.settledAt,
    orderCount: settlement.orderCount,
    codExpected: settlement.codExpected,
    codCollected: settlement.codCollected,
    expectedHandover: settlement.expectedHandover,
    actualHandover: settlement.actualHandover,
    handoverVariance: settlement.handoverVariance,
    varianceStatus: settlement.varianceStatus,
    varianceReviewedBy: settlement.varianceReviewedBy,
    varianceReviewedAt: settlement.varianceReviewedAt,
    varianceReviewNotes: settlement.varianceReviewNotes,
    bonusTotal: settlement.bonusTotal,
    notes: settlement.notes,
  };
}

function toPublicAttendanceShift(shift: DriverAttendanceShift) {
  return {
    id: shift.id,
    driverId: shift.driverId,
    branchId: shift.branchId,
    status: shift.status,
    checkedInAt: shift.checkedInAt,
    checkedOutAt: shift.checkedOutAt,
    hourlyRate: shift.hourlyRate,
    hoursWorked: shift.hoursWorked,
    wageAmount: shift.wageAmount,
    bonusTotal: shift.bonusTotal,
    totalPay: shift.totalPay,
    notes: shift.notes,
  };
}
