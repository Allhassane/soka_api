// src/shared/interfaces/user-context.interface.ts
export interface UserContext {
  user_uuid: string;
  member_uuid: string;
  structure_uuid: string;      // Structure du responsable
  accessible_structures: string[];  // Toutes les structures accessibles
}
