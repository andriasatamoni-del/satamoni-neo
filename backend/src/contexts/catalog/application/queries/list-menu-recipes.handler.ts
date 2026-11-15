import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import {
  MENU_RECIPES_READER,
  type MenuRecipe,
  type MenuRecipeItem,
  type MenuRecipeItemFilter,
  type MenuRecipeOption,
  type MenuRecipesReaderPort,
} from "../../domain/ports/menu-recipes-reader.port";

@Injectable()
export class ListMenuRecipesHandler {
  constructor(@Inject(MENU_RECIPES_READER) private readonly reader: MenuRecipesReaderPort) {}

  recipes(filter: { q?: string }, page?: PageRequest): Promise<{ rows: MenuRecipe[]; total: number }> {
    return this.reader.recipes(filter, page);
  }

  items(filter: MenuRecipeItemFilter, page?: PageRequest): Promise<{ rows: MenuRecipeItem[]; total: number }> {
    return this.reader.items(filter, page);
  }

  options(): Promise<MenuRecipeOption[]> {
    return this.reader.options();
  }
}
