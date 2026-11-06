export type WorkspaceId = "staging" | "preview";

export interface WorkspaceDefinition {
  readonly id: WorkspaceId;
  readonly label: string;
}

export const WORKSPACES: readonly WorkspaceDefinition[] = [
  { id: "staging", label: "Staging" },
  { id: "preview", label: "Preview" },
];
