import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RecordFollowupHandler } from "../application/commands/record-followup.handler";
import { UpdateComplaintStatusHandler } from "../application/commands/update-complaint-status.handler";
import { ListComplaintsHandler } from "../application/queries/list-complaints.handler";
import { GetLatestComplaintByPhoneHandler } from "../application/queries/get-latest-complaint-by-phone.handler";
import { RecordFollowupDto } from "./dto/record-followup.dto";
import { UpdateComplaintStatusDto } from "./dto/update-complaint-status.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { CrmDomainErrorFilter } from "./filters/domain-error.filter";
import { Complaint } from "../domain/complaint.aggregate";
import { CustomerFollowup } from "../domain/customer-followup.aggregate";

@Controller("crm")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(CrmDomainErrorFilter)
export class CrmController {
  constructor(
    private readonly recordFollowup: RecordFollowupHandler,
    private readonly updateComplaintStatus: UpdateComplaintStatusHandler,
    private readonly listComplaints: ListComplaintsHandler,
    private readonly getLatestComplaintByPhone: GetLatestComplaintByPhoneHandler
  ) {}

  @Post("followups")
  @RequirePermission("crm.followups.record")
  async recordFollowupCall(
    @Body() dto: RecordFollowupDto,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    const { followup, complaint } = await this.recordFollowup.execute({
      legacyOrderId: dto.legacyOrderId,
      branchId: dto.branchId,
      customerPhone: dto.customerPhone,
      callResult: dto.callResult,
      satisfactionRating: dto.satisfactionRating,
      notes: dto.notes,
      hasComplaint: dto.hasComplaint,
      complaint: dto.complaint,
      actingUserId: req.user.id,
    });
    return { followup: toPublicFollowup(followup), complaint: complaint ? toPublicComplaint(complaint) : null };
  }

  @Get("complaints")
  @RequirePermission("crm.complaints.view")
  async listOpenComplaints(@Query("status") status?: string) {
    const complaints = await this.listComplaints.execute(status ? { status } : undefined);
    return complaints.map(toPublicComplaint);
  }

  @Patch("complaints/:id")
  @RequirePermission("crm.complaints.manage")
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateComplaintStatusDto,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    const complaint = await this.updateComplaintStatus.execute({
      complaintId: id,
      status: dto.status,
      resolutionNotes: dto.resolutionNotes,
      actingUserId: req.user.id,
    });
    return toPublicComplaint(complaint);
  }

  @Get("customers/:phone/complaints/latest")
  @RequirePermission("crm.complaints.view")
  async latestComplaintForCustomer(@Param("phone") phone: string) {
    const complaint = await this.getLatestComplaintByPhone.execute(phone);
    return complaint ? toPublicComplaint(complaint) : null;
  }
}

function toPublicFollowup(followup: CustomerFollowup) {
  return {
    id: followup.id,
    legacyOrderId: followup.legacyOrderId,
    branchId: followup.branchId,
    customerPhone: followup.customerPhone,
    callResult: followup.callResult,
    satisfactionRating: followup.satisfactionRating,
    notes: followup.notes,
    hasComplaint: followup.hasComplaint,
    calledBy: followup.calledBy,
    calledAt: followup.calledAt,
  };
}

function toPublicComplaint(complaint: Complaint) {
  return {
    id: complaint.id,
    channel: complaint.channel,
    legacyOrderId: complaint.legacyOrderId,
    branchId: complaint.branchId,
    followupId: complaint.followupId,
    customerPhone: complaint.customerPhone,
    category: complaint.category,
    description: complaint.description,
    status: complaint.status,
    resolutionNotes: complaint.resolutionNotes,
    createdBy: complaint.createdBy,
    assignedTo: complaint.assignedTo,
    resolvedBy: complaint.resolvedBy,
    resolvedAt: complaint.resolvedAt,
    createdAt: complaint.createdAt,
  };
}
