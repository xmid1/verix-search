export const SCOPES = ["search", "research", "extraction", "streaming", "crawler", "admin"] as const;
export type Scope = (typeof SCOPES)[number];

export const ROLE_DEFAULT_SCOPES: Record<string, Scope[]> = {
  ADMIN: [...SCOPES],
  DEVELOPER: ["search", "research", "extraction", "streaming", "crawler"],
  READ_ONLY: ["search"],
  SEARCH_ONLY: ["search"],
};

export function hasScope(scopes: string[], required: Scope): boolean {
  return scopes.includes(required) || scopes.includes("admin");
}
