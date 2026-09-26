import { Inject, Injectable } from "@nestjs/common";
import { TalabatIntegrationError } from "../../domain/talabat-integration-error.aggregate";
import {
  TALABAT_INTEGRATION_ERROR_REPOSITORY,
  type TalabatIntegrationErrorRepositoryPort,
} from "../../domain/ports/talabat-integration-error-repository.port";

@Injectable()
export class ListIntegrationErrorsHandler {
  constructor(@Inject(TALABAT_INTEGRATION_ERROR_REPOSITORY) private readonly integrationErrors: TalabatIntegrationErrorRepositoryPort) {}

  async execute(filter?: { status?: string }): Promise<TalabatIntegrationError[]> {
    return this.integrationErrors.list(filter);
  }
}
