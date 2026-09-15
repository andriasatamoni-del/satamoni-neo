import { Global, Module } from "@nestjs/common";
import { PermissionRegistry } from "./permission-registry";

@Global()
@Module({
  providers: [PermissionRegistry],
  exports: [PermissionRegistry],
})
export class PermissionsModule {}
