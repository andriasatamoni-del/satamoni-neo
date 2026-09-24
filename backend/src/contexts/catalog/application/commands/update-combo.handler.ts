import { Inject, Injectable } from "@nestjs/common";
import { Combo } from "../../domain/combo.aggregate";
import { COMBO_REPOSITORY, type ComboRepositoryPort } from "../../domain/ports/combo-repository.port";
import { ComboNotFoundError, DuplicateComboNameError } from "../../domain/errors";

export interface UpdateComboCommand {
  comboId: string;
  name?: string;
  price?: number;
  isActive?: boolean;
}

@Injectable()
export class UpdateComboHandler {
  constructor(@Inject(COMBO_REPOSITORY) private readonly combos: ComboRepositoryPort) {}

  async execute(command: UpdateComboCommand): Promise<Combo> {
    const combo = await this.combos.findById(command.comboId);
    if (!combo) throw new ComboNotFoundError();

    if (command.name !== undefined && (await this.combos.existsByName(command.name.trim(), combo.id))) {
      throw new DuplicateComboNameError();
    }

    combo.updateDetails(command);
    await this.combos.save(combo);
    return combo;
  }
}
