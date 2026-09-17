import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service";
import { JwtAuthGuard } from "../../contexts/identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../contexts/identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../contexts/identity-access/api/guards/require-permission.decorator";

@Controller("audit-logs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @RequirePermission("audit.view")
  async list(
    @Query("actorUserId") actorUserId?: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("branchId") branchId?: string,
    @Query("action") action?: string,
    @Query("limit") limit?: string
  ) {
    return this.auditLog.list({
      actorUserId,
      entityType,
      entityId,
      branchId,
      action,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
