import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { HOME_TILE_REPOSITORY } from "./domain/ports/home-tile-repository.port";
import { KyselyHomeTileRepository } from "./infrastructure/persistence/kysely-home-tile.repository";
import { ListHomeTilesHandler } from "./application/queries/list-home-tiles.handler";
import { UpdateHomeTileHandler } from "./application/commands/update-home-tile.handler";
import { HomeTilesController } from "./api/home-tiles.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [HomeTilesController],
  providers: [{ provide: HOME_TILE_REPOSITORY, useClass: KyselyHomeTileRepository }, ListHomeTilesHandler, UpdateHomeTileHandler],
})
export class HomeTilesModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "home_tiles",
      groupLabel: "بطاقات الصفحة الرئيسية",
      permissions: [{ key: "home_tiles.manage", label: "تعديل بطاقات الصفحة الرئيسية" }],
    });
    // أدمن بس - نفس requireRole("admin") بالريبو القديم بالحرف
  }
}
