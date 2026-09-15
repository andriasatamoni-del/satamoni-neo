import type { Supplier } from "../supplier.aggregate";

export interface SupplierRepositoryPort {
  save(supplier: Supplier): Promise<void>;
  findById(id: string): Promise<Supplier | null>;
  findByLegacySupplierId(legacyId: number): Promise<Supplier | null>;
  existsByName(name: string): Promise<boolean>;
  list(): Promise<Supplier[]>;
}

export const SUPPLIER_REPOSITORY = Symbol("SUPPLIER_REPOSITORY");
