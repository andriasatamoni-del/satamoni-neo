import type { Role } from "../../shared/auth/roles";

export interface Branch { id: string; name: string; }

export interface AppUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  branchId: string | null;
  isActive: boolean;
}

export const USERS_QUERY_KEY = ["users"] as const;
