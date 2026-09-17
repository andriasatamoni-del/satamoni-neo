import { Inject, Injectable } from "@nestjs/common";
import { Branch } from "../../domain/branch.aggregate";
import { BRANCH_REPOSITORY, type BranchRepositoryPort } from "../../domain/ports/branch-repository.port";
import { BranchRegisteredEvent } from "../../domain/events/branch-registered.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";

export interface RegisterBranchCommand {
  name: string;
  address?: string | null;
  phone?: string | null;
  hours?: string | null;
  lat?: number | null;
  lng?: number | null;
  isCentralKitchen?: boolean;
  supportsDineIn?: boolean;
}

@Injectable()
export class RegisterBranchHandler {
  constructor(
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: RegisterBranchCommand): Promise<Branch> {
    const branch = Branch.register(command);
    await this.branches.save(branch);
    await this.eventBus.publish(new BranchRegisteredEvent(branch.id, branch.name));
    return branch;
  }
}
