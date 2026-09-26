import type { HomeTile } from "../home-tile.aggregate";

export interface HomeTileRepositoryPort {
  save(tile: HomeTile): Promise<void>;
  findById(id: string): Promise<HomeTile | null>;
  list(): Promise<HomeTile[]>;
}

export const HOME_TILE_REPOSITORY = Symbol("HOME_TILE_REPOSITORY");
