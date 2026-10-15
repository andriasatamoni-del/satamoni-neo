import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { HOME_TILE_REPOSITORY } from "./domain/ports/home-tile-repository.port";
import { HomeTileRepository } from "./infrastructure/persistence/home-tile.repository";
import { ListHomeTilesHandler } from "./application/queries/list-home-tiles.handler";
import { UpdateHomeTileHandler } from "./application/commands/update-home-tile.handler";
import { HomeTilesController } from "./api/home-tiles.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [HomeTilesController],
  providers: [{ provide: HOME_TILE_REPOSITORY, useClass: HomeTileRepository }, ListHomeTilesHandler, UpdateHomeTileHandler],
})
export class HomeTilesModule {}
