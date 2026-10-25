import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import { CustomerAuthGuard } from "../../customers/api/guards/customer-auth.guard";
import type { Customer } from "../../customers/domain/customer.aggregate";
import { ListLoyaltyRewardsHandler } from "../application/queries/list-loyalty-rewards.handler";
import { GetCustomerLoyaltyHandler } from "../application/queries/get-customer-loyalty.handler";
import { SaveLoyaltyRewardHandler } from "../application/commands/save-loyalty-reward.handler";
import { SaveLoyaltyRewardDto } from "./dto/save-loyalty-reward.dto";
import { LoyaltyDomainErrorFilter } from "./filters/domain-error.filter";
import { PERMISSION } from "../../identity-access/domain/permission";
import { ListQueryDto, listResponse, pageOfRows, pageRequestOf } from "../../../shared/http/list-query.dto";

// إدارة كتالوج المكافآت (الموظفين) - نسبة الكسب نفسها في إعدادات النظام (loyaltyPointsPerEgp)
@Controller("loyalty/rewards")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(LoyaltyDomainErrorFilter)
export class LoyaltyRewardsController {
  constructor(
    private readonly listRewards: ListLoyaltyRewardsHandler,
    private readonly saveReward: SaveLoyaltyRewardHandler
  ) {}

  @Get()
  @RequirePermission(PERMISSION.LOYALTY_VIEW, PERMISSION.LOYALTY_MANAGE)
  async list(@Query() query: ListQueryDto) {
    const page = pageRequestOf(query);
    const rows = await this.listRewards.execute();
    return listResponse(pageOfRows(rows, page), rows.length, page);
  }

  @Post()
  @RequirePermission(PERMISSION.LOYALTY_MANAGE)
  async create(@Body() dto: SaveLoyaltyRewardDto) {
    return this.saveReward.create(dto);
  }

  @Patch(":id")
  @RequirePermission(PERMISSION.LOYALTY_MANAGE)
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SaveLoyaltyRewardDto) {
    return this.saveReward.update(id, dto);
  }
}

// "نقاطي" للعميل المسجّل على موقع الطلب
@Controller("loyalty/me")
@UseGuards(CustomerAuthGuard)
@UseFilters(LoyaltyDomainErrorFilter)
export class CustomerLoyaltyController {
  constructor(private readonly getLoyalty: GetCustomerLoyaltyHandler) {}

  @Get()
  async me(@Req() req: Request & { customer: Customer }) {
    return this.getLoyalty.execute(req.customer);
  }
}
