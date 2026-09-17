import { Global, Module, OnModuleInit } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PermissionRegistry } from "../permissions/permission-registry";
import { IdentityAccessModule } from "../../contexts/identity-access/identity-access.module";
import { AuditLogService } from "./audit-log.service";
import { AuditLogInterceptor } from "./audit-log.interceptor";
import { AuditLogController } from "./audit-log.controller";

@Global()
@Module({
  imports: [IdentityAccessModule],
  controllers: [AuditLogController],
  providers: [AuditLogService, { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor }],
  exports: [AuditLogService],
})
export class AuditModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "audit",
      groupLabel: "سجل التدقيق",
      permissions: [{ key: "audit.view", label: "رؤية سجل التدقيق العام" }],
    });
    // مفيش role تاني بياخد الصلاحية دي افتراضيًا غير admin (كاتش-أول الأدمن في
    // PermissionRegistry.hasPermission) - سجل تدقيق حساس أمنيًا، أدمن بس بشكل افتراضي
  }
}
