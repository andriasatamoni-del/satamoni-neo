import { Inject, Injectable } from "@nestjs/common";
import { Combo } from "../../domain/combo.aggregate";
import { COMBO_REPOSITORY, type ComboRepositoryPort } from "../../domain/ports/combo-repository.port";

@Injectable()
export class ListCombosHandler {
  constructor(@Inject(COMBO_REPOSITORY) private readonly combos: ComboRepositoryPort) {}

  execute(filter?: { activeOnly?: boolean }): Promise<Combo[]> {
    return this.combos.list(filter);
  }
}
