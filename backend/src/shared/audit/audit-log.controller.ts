import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service";
import { ListAuditLogsQueryDto } from "./list-audit-logs-query.dto";
import { cappedPage, listResponse, splitListQuery } from "../http/list-query.dto";
import { JwtAuthGuard } from "../../contexts/identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../contexts/identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../contexts/identity-access/api/guards/require-permission.decorator";
import { PERMISSION } from "../../contexts/identity-access/domain/permission";

@Controller("audit-logs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @RequirePermission(PERMISSION.AUDIT_VIEW)
  async list(@Query() query: ListAuditLogsQueryDto) {
    const { page, filter } = splitListQuery(query);
    // unpaged: the latest `limit` rows, default 100 and at most 500, as before NEO-6; paged mode can reach every row
    const { records, total } = await this.auditLog.list(filter, cappedPage(query, page, 100, 500));
    return listResponse(records, total, page);
  }
}
