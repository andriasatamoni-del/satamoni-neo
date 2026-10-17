import { Body, Controller, Get, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { OpenShiftHandler } from "../application/commands/open-shift.handler";
import { CloseShiftHandler } from "../application/commands/close-shift.handler";
import { ReviewShiftVarianceHandler } from "../application/commands/review-shift-variance.handler";
import { PreviewShiftHandler } from "../application/queries/preview-shift.handler";
import { ListShiftsHandler } from "../application/queries/list-shifts.handler";
import { RegisterCashDrawerEntryHandler } from "../application/commands/register-cash-drawer-entry.handler";
import { ListCashDrawerEntriesHandler } from "../application/queries/list-cash-drawer-entries.handler";
import { OpenShiftDto } from "./dto/open-shift.dto";
import { CloseShiftDto } from "./dto/close-shift.dto";
import { ReviewShiftVarianceDto } from "./dto/review-shift-variance.dto";
import { RegisterCashDrawerEntryDto } from "./dto/register-cash-drawer-entry.dto";
import type { CashDrawerEntry } from "../domain/cash-drawer-entry.aggregate";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { hasAnyRole, ROLE } from "../../identity-access/domain/role";
import { BranchScopeGuard, BranchScoped, BranchResource } from "../../../shared/authorization/branch-scope";
import { ShiftsDomainErrorFilter } from "./filters/domain-error.filter";
import type { CashierShift } from "../domain/cashier-shift.aggregate";
import { PERMISSION } from "../../identity-access/domain/permission";
import { cappedPage, listResponse, splitListQuery } from "../../../shared/http/list-query.dto";
import { ListShiftsQueryDto } from "./dto/list-shifts-query.dto";

type Req_ = Request & { user: AuthenticatedUser };

@Controller("shifts")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
@UseFilters(ShiftsDomainErrorFilter)
export class ShiftsController {
  constructor(
    private readonly openShift: OpenShiftHandler,
    private readonly closeShift: CloseShiftHandler,
    private readonly reviewShiftVariance: ReviewShiftVarianceHandler,
    private readonly previewShift: PreviewShiftHandler,
    private readonly listShifts: ListShiftsHandler,
    private readonly registerCashDrawerEntry: RegisterCashDrawerEntryHandler,
    private readonly listCashDrawerEntries: ListCashDrawerEntriesHandler
  ) {}

  @BranchScoped()
  @Post("open")
  @RequirePermission(PERMISSION.SHIFTS_OPEN_OWN)
  async open(@Body() dto: OpenShiftDto, @Req() req: Req_) {
    const branchId = hasAnyRole(req.user.roles, ROLE.ADMIN) ? dto.branchId || req.user.branchId : req.user.branchId;
    return toPublicShift(
      await this.openShift.execute({ branchId, userId: req.user.id, openingCash: dto.openingCash, openingNotes: dto.openingNotes })
    );
  }

  @Get("current")
  @RequirePermission(PERMISSION.SHIFTS_VIEW_OWN)
  async current(@Req() req: Req_) {
    const shift = await this.listShifts.currentForUser(req.user.id);
    return shift ? toPublicShift(shift) : null;
  }

  @BranchScoped()
  @BranchResource("cashier_shifts")
  @Get(":id/preview")
  @RequirePermission(PERMISSION.SHIFTS_VIEW_OWN)
  async preview(@Param("id") id: string) {
    return this.previewShift.execute(id);
  }

  @BranchScoped()
  @BranchResource("cashier_shifts")
  @Post(":id/close")
  @RequirePermission(PERMISSION.SHIFTS_CLOSE_OWN)
  async close(@Param("id") id: string, @Body() dto: CloseShiftDto, @Req() req: Req_) {
    return toPublicShift(
      await this.closeShift.execute({ shiftId: id, actualCash: dto.actualCash, closingNotes: dto.closingNotes, closedBy: req.user.id })
    );
  }

  @BranchScoped()
  @BranchResource("cashier_shifts")
  @Post(":id/review")
  @RequirePermission(PERMISSION.SHIFTS_REVIEW)
  async review(@Param("id") id: string, @Body() dto: ReviewShiftVarianceDto, @Req() req: Req_) {
    return toPublicShift(
      await this.reviewShiftVariance.execute({ shiftId: id, decision: dto.decision, notes: dto.notes, reviewerId: req.user.id })
    );
  }

  @BranchScoped()
  @Get()
  @RequirePermission(PERMISSION.SHIFTS_VIEW_BRANCH)
  async list(@Query() query: ListShiftsQueryDto, @Req() req: Req_) {
    const { page, filter } = splitListQuery(query);
    const effectiveBranchId = filter.branchId || req.user.branchId;
    if (!effectiveBranchId) return listResponse([], 0, page);
    // unpaged: the latest 200 shifts, as before NEO-6
    const { shifts, total } = await this.listShifts.execute({ ...filter, branchId: effectiveBranchId }, cappedPage(query, page, 200, 200));
    return listResponse(shifts.map(toPublicShift), total, page);
  }

  @BranchScoped()
  @BranchResource("cashier_shifts")
  @Post(":id/cash-drawer-entries")
  @RequirePermission(PERMISSION.SHIFTS_RECORD_CASH_ENTRY)
  async addCashDrawerEntry(@Param("id") id: string, @Body() dto: RegisterCashDrawerEntryDto, @Req() req: Req_) {
    return toPublicCashDrawerEntry(
      await this.registerCashDrawerEntry.execute({
        shiftId: id,
        entryType: dto.entryType,
        amount: dto.amount,
        label: dto.label,
        notes: dto.notes,
        createdBy: req.user.id,
      })
    );
  }

  @BranchScoped()
  @BranchResource("cashier_shifts")
  @Get(":id/cash-drawer-entries")
  @RequirePermission(PERMISSION.SHIFTS_VIEW_OWN)
  async cashDrawerEntries(@Param("id") id: string) {
    return (await this.listCashDrawerEntries.execute(id)).map(toPublicCashDrawerEntry);
  }
}

function toPublicShift(shift: CashierShift) {
  return {
    id: shift.id,
    branchId: shift.branchId,
    userId: shift.userId,
    status: shift.status,
    openedAt: shift.openedAt,
    openingCash: shift.openingCash,
    openingNotes: shift.openingNotes,
    closedAt: shift.closedAt,
    actualCash: shift.actualCash,
    expectedCash: shift.expectedCash,
    cashVariance: shift.cashVariance,
    closingNotes: shift.closingNotes,
    cashSales: shift.cashSales,
    cardSales: shift.cardSales,
    otherSales: shift.otherSales,
    orderCount: shift.orderCount,
    cashExpensesTotal: shift.cashExpensesTotal,
    cashPurchasesTotal: shift.cashPurchasesTotal,
    varianceStatus: shift.varianceStatus,
    varianceReviewedAt: shift.varianceReviewedAt,
    varianceReviewNotes: shift.varianceReviewNotes,
  };
}

function toPublicCashDrawerEntry(entry: CashDrawerEntry) {
  return {
    id: entry.id,
    shiftId: entry.shiftId,
    entryType: entry.entryType,
    amount: entry.amount,
    label: entry.label,
    notes: entry.notes,
    createdAt: entry.createdAt,
  };
}
