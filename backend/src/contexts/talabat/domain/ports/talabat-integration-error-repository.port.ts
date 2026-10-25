import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { TalabatIntegrationError } from "../talabat-integration-error.aggregate";

export interface TalabatIntegrationErrorRepositoryPort {
  save(error: TalabatIntegrationError): Promise<void>;
  findById(id: string): Promise<TalabatIntegrationError | null>;
  list(filter?: { status?: string }): Promise<TalabatIntegrationError[]>;
  listPage(filter?: { status?: string }, page?: PageRequest): Promise<{ rows: TalabatIntegrationError[]; total: number }>;
}

export const TALABAT_INTEGRATION_ERROR_REPOSITORY = Symbol("TALABAT_INTEGRATION_ERROR_REPOSITORY");
