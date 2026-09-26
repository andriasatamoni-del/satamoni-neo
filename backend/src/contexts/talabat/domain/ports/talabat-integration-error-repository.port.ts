import type { TalabatIntegrationError } from "../talabat-integration-error.aggregate";

export interface TalabatIntegrationErrorRepositoryPort {
  save(error: TalabatIntegrationError): Promise<void>;
  findById(id: string): Promise<TalabatIntegrationError | null>;
  list(filter?: { status?: string }): Promise<TalabatIntegrationError[]>;
}

export const TALABAT_INTEGRATION_ERROR_REPOSITORY = Symbol("TALABAT_INTEGRATION_ERROR_REPOSITORY");
