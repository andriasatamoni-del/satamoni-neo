import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { GetPosSettingsHandler } from "../application/queries/get-pos-settings.handler";
import { UpdatePosSettingsHandler } from "../application/commands/update-pos-settings.handler";
import { UpdatePosSettingsDto } from "./dto/update-pos-settings.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import type { PosSettings } from "../domain/pos-settings.aggregate";

@Controller("pos-settings")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PosSettingsController {
  constructor(
    private readonly getSettings: GetPosSettingsHandler,
    private readonly updateSettings: UpdatePosSettingsHandler
  ) {}

  // كل مستخدم مسجّل دخول يقدر يقرأ الإعدادات (بيُستخدم قيمها في شاشات تانية - أجر الساعة الافتراضي في
  // شاشة تسجيل دخول السائق مثلًا) - القراءة مش حساسة، التعديل بس محتاج صلاحية
  @Get()
  @RequirePermission("pos_settings.view", "pos_settings.manage")
  async get() {
    return toPublic(await this.getSettings.execute());
  }

  @Patch()
  @RequirePermission("pos_settings.manage")
  async update(@Body() dto: UpdatePosSettingsDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublic(await this.updateSettings.execute({ ...dto, updatedBy: req.user.id }));
  }
}

function toPublic(settings: PosSettings) {
  return {
    shiftVarianceAckThresholdEgp: settings.shiftVarianceAckThresholdEgp,
    driverSettlementVarianceAckThresholdEgp: settings.driverSettlementVarianceAckThresholdEgp,
    driverHourlyRateEgp: settings.driverHourlyRateEgp,
    paymentAdjustmentHighThresholdEgp: settings.paymentAdjustmentHighThresholdEgp,
    productionVarianceAlertPercent: settings.productionVarianceAlertPercent,
    updatedBy: settings.updatedBy,
    updatedAt: settings.updatedAt,
  };
}
