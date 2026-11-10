import {
  SLOT_CAPABLE_PROPERTIES,
  type Placement,
  type SlotProperty,
} from "./model";
import { rowTop, type TimelineRow } from "./timeline-rows";

export interface SlotWireLayout {
  readonly cellWidth: number;
  readonly cellGap: number;
  readonly blockInset: number;
  readonly trackHeight: number;
  readonly slotHeight: number;
}

export interface SlotWire {
  readonly key: string;
  readonly x: number;
  readonly blockBottomY: number;
  readonly slotY: number;
}

interface PendingBlock {
  readonly blockId: string;
  readonly trackIndex: number;
  readonly blockBottomY: number;
  readonly properties: readonly SlotProperty[];
  readonly bindings: Placement["slotBindings"];
}

export function slotWires(
  rows: readonly TimelineRow[],
  blocks: readonly Placement[],
  layout: SlotWireLayout,
): readonly SlotWire[] {
  const trackRows = new Map<string, number>();
  const slotRows = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row.kind === "track") {
      trackRows.set(row.trackId, index);
    } else {
      slotRows.set(row.slotId, index);
    }
  });

  const columns = new Map<number, PendingBlock[]>();

  for (const block of blocks) {
    const properties = SLOT_CAPABLE_PROPERTIES[block.kind];
    if (properties.length === 0) {
      continue;
    }
    const trackIndex = trackRows.get(block.trackId)!;
    const entry: PendingBlock = {
      blockId: block.id,
      trackIndex,
      blockBottomY:
        rowTop(rows, trackIndex, layout.trackHeight, layout.slotHeight) +
        layout.trackHeight -
        layout.blockInset,
      properties,
      bindings: block.slotBindings,
    };
    const column = columns.get(block.start);
    if (column === undefined) {
      columns.set(block.start, [entry]);
    } else {
      column.push(entry);
    }
  }

  const laneWidth = layout.cellWidth - layout.cellGap - 2 * layout.blockInset;
  const wires: SlotWire[] = [];

  for (const start of [...columns.keys()].sort((a, b) => a - b)) {
    const column = columns.get(start)!;
    column.sort((a, b) => a.trackIndex - b.trackIndex);
    const laneCount = column.reduce(
      (count, entry) => count + entry.properties.length,
      0,
    );
    const columnLeft =
      start * layout.cellWidth + layout.cellGap + layout.blockInset;
    let lane = 0;

    for (const entry of column) {
      for (const property of entry.properties) {
        const slotId = entry.bindings?.[property.key];
        const slotIndex =
          slotId === undefined ? undefined : slotRows.get(slotId);
        if (slotId !== undefined && slotIndex !== undefined) {
          wires.push({
            key: `${entry.blockId}:${property.key}`,
            x: columnLeft + (laneWidth * (lane + 1)) / (laneCount + 1),
            blockBottomY: entry.blockBottomY,
            slotY:
              rowTop(rows, slotIndex, layout.trackHeight, layout.slotHeight) +
              layout.slotHeight / 2,
          });
        }
        lane += 1;
      }
    }
  }

  return wires;
}
