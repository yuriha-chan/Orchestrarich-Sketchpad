export interface PlacementBase {
  id: string;
  trackId: string;
  start: number;
  length: number;
  cooperativeSkip: boolean;
  slotBindings?: Partial<Record<string, string>>;
}

export type Placement<T = unknown> = PlacementBase & {
  kind: string;
  data: T;
};
