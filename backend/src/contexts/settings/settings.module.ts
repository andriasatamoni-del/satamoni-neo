import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { POS_SETTINGS_REPOSITORY } from "./domain/ports/pos-settings-repository.port";
import { KyselyPosSettingsRepository } from "./infrastructure/persistence/kysely-pos-settings.repository";
import { GetPosSettingsHandler } from "./application/queries/get-pos-settings.handler";
import { UpdatePosSettingsHandler } from "./application/commands/update-pos-settings.handler";
import { PosSettingsController } from "./api/pos-settings.controller";

// Settings context - نفس مفهوم pos_settings في الريبو القديم: صف إعدادات واحد قابل للتهيئة، بيستهلكه
// contexts تانية (shifts، delivery، payment-control، production) كانت بتثبّت نفس القيم دي في الكود -
// راجع تعليقاتهم القديمة. exports بس الـport عشان الـcontexts التانية تحقن GetPosSettingsHandler أو
// الـport نفسه من غير ما تعرف حاجة عن تفاصيل التخزين
@Module({
  imports: [IdentityAccessModule],
  controllers: [PosSettingsController],
  providers: [
    { provide: POS_SETTINGS_REPOSITORY, useClass: KyselyPosSettingsRepository },
    GetPosSettingsHandler,
    UpdatePosSettingsHandler,
  ],
  exports: [POS_SETTINGS_REPOSITORY, GetPosSettingsHandler],
})
export class SettingsModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "pos_settings",
      groupLabel: "إعدادات النظام",
      permissions: [
        { key: "pos_settings.view", label: "رؤية إعدادات النظام" },
        { key: "pos_settings.manage", label: "تعديل إعدادات النظام" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", ["pos_settings.view"]);
    this.permissions.setRoleDefaults("accountant", ["pos_settings.view"]);
    this.permissions.setRoleDefaults("cashier", ["pos_settings.view"]);
    this.permissions.setRoleDefaults("driver", ["pos_settings.view"]);
  }
}
