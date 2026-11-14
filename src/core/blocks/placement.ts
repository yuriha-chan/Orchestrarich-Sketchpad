declare const integerBrand: unique symbol;

export type Integer = number & { readonly [integerBrand]: true };

export function isInteger(value: number): value is Integer {
  return Number.isInteger(value);
}

export function toInteger(value: number): Integer {
  if (!isInteger(value)) {
    throw new RangeError(`Expected an integer coordinate, received ${value}`);
  }
  return value;
}

export interface PlacementBase {
  id: string;
  trackId: string;
  start: Integer;
  length: Integer;
  cooperativeSkip: boolean;
  slotBindings?: Partial<Record<string, string>>;
}

export type Placement<T = unknown> = PlacementBase & {
  kind: string;
  data: T;
};
