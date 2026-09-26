import { Inject, Injectable } from "@nestjs/common";
import { HomeTile } from "../../domain/home-tile.aggregate";
import { HOME_TILE_REPOSITORY, type HomeTileRepositoryPort } from "../../domain/ports/home-tile-repository.port";

@Injectable()
export class ListHomeTilesHandler {
  constructor(@Inject(HOME_TILE_REPOSITORY) private readonly tiles: HomeTileRepositoryPort) {}

  async execute(): Promise<HomeTile[]> {
    return this.tiles.list();
  }
}
