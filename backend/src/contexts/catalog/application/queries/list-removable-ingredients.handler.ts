import { Inject, Injectable } from "@nestjs/common";
import {
  REMOVABLE_INGREDIENTS_READER,
  type RemovableIngredientsReaderPort,
  type VariantRemovableIngredients,
} from "../../domain/ports/removable-ingredients-reader.port";

@Injectable()
export class ListRemovableIngredientsHandler {
  constructor(@Inject(REMOVABLE_INGREDIENTS_READER) private readonly reader: RemovableIngredientsReaderPort) {}

  execute(): Promise<VariantRemovableIngredients[]> {
    return this.reader.byVariant();
  }
}
