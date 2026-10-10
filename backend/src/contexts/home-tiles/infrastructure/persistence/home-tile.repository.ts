import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { HomeTile } from "../../domain/home-tile.aggregate";
import type { HomeTileRepositoryPort } from "../../domain/ports/home-tile-repository.port";
import { homeTiles } from "./home-tiles.tables";

@Injectable()
export class HomeTileRepository implements HomeTileRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(tile: HomeTile): Promise<void> {
    await this.db
      .update(homeTiles)
      .set({
        title: tile.title,
        description: tile.description,
        display_order: tile.displayOrder,
        updated_at: tile.updatedAt,
      })
      .where(eq(homeTiles.id, tile.id));
  }

  async findById(id: string): Promise<HomeTile | null> {
    const [row] = await this.db.select().from(homeTiles).where(eq(homeTiles.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<HomeTile[]> {
    const rows = await this.db.select().from(homeTiles).orderBy(asc(homeTiles.display_order), asc(homeTiles.id));
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: typeof homeTiles.$inferSelect): HomeTile {
    return HomeTile.reconstitute(row.id, {
      tileKey: row.tile_key,
      href: row.href,
      icon: row.icon,
      title: row.title,
      description: row.description,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
