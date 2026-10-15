import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { POS_SETTINGS_REPOSITORY } from "./domain/ports/pos-settings-repository.port";
import { PosSettingsRepository } from "./infrastructure/persistence/pos-settings.repository";
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
    { provide: POS_SETTINGS_REPOSITORY, useClass: PosSettingsRepository },
    GetPosSettingsHandler,
    UpdatePosSettingsHandler,
  ],
  exports: [POS_SETTINGS_REPOSITORY, GetPosSettingsHandler],
})
export class SettingsModule {}
