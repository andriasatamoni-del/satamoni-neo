import { Body, Controller, Get, Param, Patch, UseFilters, UseGuards } from "@nestjs/common";
import { ListHomeTilesHandler } from "../application/queries/list-home-tiles.handler";
import { UpdateHomeTileHandler } from "../application/commands/update-home-tile.handler";
import { UpdateHomeTileDto } from "./dto/update-home-tile.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import { HomeTilesDomainErrorFilter } from "./filters/domain-error.filter";
import type { HomeTile } from "../domain/home-tile.aggregate";

// GET متاح لأي موظف مسجّل دخول (مفيش صلاحية مطلوبة - نفس فلسفة "الصفحة الرئيسية بتاعة الكل" بالريبو
// القديم، بس هنا خلف تسجيل الدخول لأن neo مالوش مفهوم صفحة عامة قبل الدخول أصلًا). PATCH أدمن بس.
@Controller("home-tiles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(HomeTilesDomainErrorFilter)
export class HomeTilesController {
  constructor(
    private readonly listHomeTiles: ListHomeTilesHandler,
    private readonly updateHomeTile: UpdateHomeTileHandler
  ) {}

  @Get()
  async list() {
    return (await this.listHomeTiles.execute()).map(toPublicHomeTile);
  }

  @Patch(":id")
  @RequirePermission("home_tiles.manage")
  async update(@Param("id") id: string, @Body() dto: UpdateHomeTileDto) {
    return toPublicHomeTile(await this.updateHomeTile.execute({ tileId: id, ...dto }));
  }
}

function toPublicHomeTile(tile: HomeTile) {
  return {
    id: tile.id,
    tileKey: tile.tileKey,
    href: tile.href,
    icon: tile.icon,
    title: tile.title,
    description: tile.description,
    displayOrder: tile.displayOrder,
  };
}
