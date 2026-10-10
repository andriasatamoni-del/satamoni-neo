import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { HomeTile } from "../../domain/home-tile.aggregate";
import type { HomeTileRepositoryPort } from "../../domain/ports/home-tile-repository.port";
import type { HomeTilesTable } from "./home-tile.schema";

@Injectable()
export class KyselyHomeTileRepository implements HomeTileRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(tile: HomeTile): Promise<void> {
    await this.db
      .updateTable("home_tiles")
      .set({
        title: tile.title,
        description: tile.description,
        display_order: tile.displayOrder,
        updated_at: tile.updatedAt,
      })
      .where("id", "=", tile.id)
      .execute();
  }

  async findById(id: string): Promise<HomeTile | null> {
    const row = await this.db.selectFrom("home_tiles").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<HomeTile[]> {
    const rows = await this.db.selectFrom("home_tiles").selectAll().orderBy("display_order").orderBy("id").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<HomeTilesTable>): HomeTile {
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
