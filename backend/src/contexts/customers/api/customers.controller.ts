import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import { PERMISSION } from "../../identity-access/domain/permission";
import { BranchScopeGuard } from "../../../shared/authorization/branch-scope";
import { pageRequestOf } from "../../../shared/http/list-query.dto";
import { ListCustomersHandler } from "../application/queries/list-customers.handler";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto";

@Controller("customers")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class CustomersController {
  constructor(private readonly listCustomers: ListCustomersHandler) {}

  @Get()
  @RequirePermission(PERMISSION.CUSTOMERS_VIEW)
  async list(@Query() query: ListCustomersQueryDto) {
    const page = pageRequestOf({ ...query, paginate: true })!;
    const { rows, total } = await this.listCustomers.execute(
      { q: query.q, blocked: query.blocked, sort: query.sort, order: query.order },
      page
    );
    return { items: rows, total, limit: page.limit, offset: page.offset };
  }
}
