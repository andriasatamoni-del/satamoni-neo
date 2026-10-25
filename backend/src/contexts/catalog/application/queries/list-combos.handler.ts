import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { Combo } from "../../domain/combo.aggregate";
import { COMBO_REPOSITORY, type ComboRepositoryPort } from "../../domain/ports/combo-repository.port";

@Injectable()
export class ListCombosHandler {
  constructor(@Inject(COMBO_REPOSITORY) private readonly combos: ComboRepositoryPort) {}

  execute(filter?: { activeOnly?: boolean }, page?: PageRequest): Promise<{ rows: Combo[]; total: number }> {
    return this.combos.listPage(filter, page);
  }
}
