import { Inject, Injectable } from "@nestjs/common";
import { HomeTile } from "../../domain/home-tile.aggregate";
import { HOME_TILE_REPOSITORY, type HomeTileRepositoryPort } from "../../domain/ports/home-tile-repository.port";
import { HomeTileNotFoundError } from "../../domain/errors";

export interface UpdateHomeTileCommand {
  tileId: string;
  title?: string;
  description?: string;
  displayOrder?: number;
}

// نفس تقييد routes/home-tiles.js بالريبو القديم بالحرف - العنوان/الوصف/الترتيب بس قابلين للتعديل،
// tileKey/href/icon ثابتين (مرتبطين بصفحة حقيقية في الكود، مش نص عرض).
@Injectable()
export class UpdateHomeTileHandler {
  constructor(@Inject(HOME_TILE_REPOSITORY) private readonly tiles: HomeTileRepositoryPort) {}

  async execute(command: UpdateHomeTileCommand): Promise<HomeTile> {
    const tile = await this.tiles.findById(command.tileId);
    if (!tile) throw new HomeTileNotFoundError();

    tile.updateDisplay({ title: command.title, description: command.description, displayOrder: command.displayOrder });
    await this.tiles.save(tile);
    return tile;
  }
}
