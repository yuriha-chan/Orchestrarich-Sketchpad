import { describe, expect, it } from "vitest";
import { slotValueRail } from "./slot-value-rail";

const initialization = (time: number, value: number) => ({ time, value });

describe("slotValueRail", () => {
  it("returns no spans or dots for a slot without initializations", () => {
    expect(slotValueRail([], 8)).toEqual({ spans: [], dots: [] });
  });

  it("extends the last initialization to the rendered columns", () => {
    expect(slotValueRail([initialization(2, 10)], 8)).toEqual({
      spans: [{ start: 2, end: 8 }],
      dots: [3, 4, 5, 6, 7],
    });
  });

  it("ends each span before the next initialization and marks the crossed gaps", () => {
    expect(
      slotValueRail([initialization(0, 3), initialization(3, 8)], 8),
    ).toEqual({
      spans: [
        { start: 0, end: 3 },
        { start: 3, end: 8 },
      ],
      dots: [1, 2, 4, 5, 6, 7],
    });
  });

  it("omits dots when initializations are adjacent", () => {
    expect(
      slotValueRail([initialization(1, 3), initialization(2, 8)], 8),
    ).toEqual({
      spans: [
        { start: 1, end: 2 },
        { start: 2, end: 8 },
      ],
      dots: [3, 4, 5, 6, 7],
    });
  });

  it("sorts initializations before building the rail", () => {
    expect(
      slotValueRail(
        [
          initialization(3, 1),
          initialization(0, 2),
          initialization(5, 4),
        ],
        8,
      ),
    ).toEqual({
      spans: [
        { start: 0, end: 3 },
        { start: 3, end: 5 },
        { start: 5, end: 8 },
      ],
      dots: [1, 2, 4, 6, 7],
    });
  });

  it("clips the rail to the rendered columns", () => {
    expect(
      slotValueRail([initialization(0, 3), initialization(10, 8)], 4),
    ).toEqual({
      spans: [{ start: 0, end: 4 }],
      dots: [1, 2, 3],
    });
  });

  it("omits the rail when all initializations are beyond the rendered columns", () => {
    expect(slotValueRail([initialization(10, 8)], 4)).toEqual({
      spans: [],
      dots: [],
    });
  });
});
