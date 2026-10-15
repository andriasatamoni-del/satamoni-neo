import { Global, Module, OnModuleInit } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { IdentityAccessModule } from "../../contexts/identity-access/identity-access.module";
import { registerDenialRecorder } from "./audit-denial";
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
  constructor(
    private readonly auditLog: AuditLogService
  ) {}

  onModuleInit(): void {
    registerDenialRecorder(this.auditLog);
  }
}
