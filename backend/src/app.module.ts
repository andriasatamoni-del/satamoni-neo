import { Module } from "@nestjs/common";
import { DatabaseModule } from "./shared/database/database.module";
import { EventsModule } from "./shared/events/events.module";
import { PermissionsModule } from "./shared/permissions/permissions.module";
import { IdentityAccessModule } from "./contexts/identity-access/identity-access.module";
import { CrmModule } from "./contexts/crm/crm.module";

@Module({
  imports: [DatabaseModule, EventsModule, PermissionsModule, IdentityAccessModule, CrmModule],
})
export class AppModule {}
