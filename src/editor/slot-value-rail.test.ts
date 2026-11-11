import { describe, expect, it } from "vitest";
import { slotValueRail } from "./slot-value-rail";

const anchor = (left: number, center: number) => ({ left, center });

const gapCenters = [10, 40, 70, 100, 130, 160, 190, 220];

describe("slotValueRail", () => {
  it("returns no spans or dots without anchors", () => {
    expect(slotValueRail([], gapCenters, 240)).toEqual({
      spans: [],
      dots: [],
    });
  });

  it("extends the last anchor to the rendered width", () => {
    expect(slotValueRail([anchor(0, 10)], gapCenters, 240)).toEqual({
      spans: [{ x1: 10, x2: 240 }],
      dots: [40, 70, 100, 130, 160, 190, 220],
    });
  });

  it("ends a span before entering the next anchor gap", () => {
    expect(
      slotValueRail([anchor(0, 10), anchor(60, 70)], gapCenters, 240),
    ).toEqual({
      spans: [
        { x1: 10, x2: 60 },
        { x1: 70, x2: 240 },
      ],
      dots: [40, 100, 130, 160, 190, 220],
    });
  });

  it("omits dots for gaps adjacent to an anchor", () => {
    expect(
      slotValueRail([anchor(0, 10), anchor(30, 40)], gapCenters, 240),
    ).toEqual({
      spans: [
        { x1: 10, x2: 30 },
        { x1: 40, x2: 240 },
      ],
      dots: [70, 100, 130, 160, 190, 220],
    });
  });

  it("sorts anchors before building the rail", () => {
    expect(
      slotValueRail(
        [anchor(120, 130), anchor(0, 10), anchor(60, 70)],
        gapCenters,
        240,
      ),
    ).toEqual({
      spans: [
        { x1: 10, x2: 60 },
        { x1: 70, x2: 120 },
        { x1: 130, x2: 240 },
      ],
      dots: [40, 100, 160, 190, 220],
    });
  });

  it("clips the rail to the rendered width", () => {
    expect(
      slotValueRail([anchor(0, 10), anchor(300, 310)], gapCenters, 240),
    ).toEqual({
      spans: [{ x1: 10, x2: 240 }],
      dots: [40, 70, 100, 130, 160, 190, 220],
    });
  });

  it("omits the rail when every anchor is beyond the rendered width", () => {
    expect(slotValueRail([anchor(300, 310)], gapCenters, 240)).toEqual({
      spans: [],
      dots: [],
    });
  });
});
