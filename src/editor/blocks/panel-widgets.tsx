import { useLayoutEffect, useState } from "react";
import { AudioLines, Clock } from "lucide-react";
import type { NumericSlot } from "../../core/slots/numeric-slots";
import type { DurationUnit, Placement, Track, Vec3 } from "../model";
import { convertDuration } from "../model";
import { useExperimentStore } from "../store";
import type { DurationData } from "./duration-data";
import { clampFadesToLength, type MediaData } from "./media-data";

export function PropertyNumber({
  value,
  min,
  max,
  step = 1,
  disabled,
  ariaLabel,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  ariaLabel?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useLayoutEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    onCommit(clamp(parsed, min, max));
    setDraft(String(value));
  };

  return (
    <input
      type="number"
      className="inspector-number"
      aria-label={ariaLabel}
      value={draft}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function DurationFields<T extends DurationData>({
  block,
  editable,
  update,
}: {
  block: Placement<T>;
  editable: boolean;
  update: (change: (data: T) => T) => void;
}) {
  const bpm = useExperimentStore((state) => state.bpm);
  const data = block.data;
  const unit = data.durationUnit;
  const synced = data.syncBeatsToCellSpan;
  const value = roundTo(synced ? block.length : data.duration, 3);

  const setUnit = (next: DurationUnit) => {
    if (!editable || synced || data.durationUnit === next) {
      return;
    }
    update((current) =>
      current.syncBeatsToCellSpan || current.durationUnit === next
        ? current
        : ({
            ...current,
            duration: convertDuration(
              current.duration,
              current.durationUnit,
              next,
              bpm,
            ),
            durationUnit: next,
          } as T),
    );
  };

  return (
    <>
      <div className="inspector-field">
        <span>Duration</span>
        <div className="duration-control">
          <PropertyNumber
            key={`duration-${block.id}-${unit}`}
            value={value}
            min={unit === "beats" ? 0.25 : 0.05}
            max={unit === "beats" ? 256 : 120}
            step={unit === "beats" ? 0.25 : 0.05}
            ariaLabel="Duration"
            disabled={!editable || synced}
            onCommit={(next) => {
              if (!Number.isFinite(next) || next <= 0) {
                return;
              }
              update((current) =>
                current.syncBeatsToCellSpan
                  ? current
                  : ({ ...current, duration: next } as T),
              );
            }}
          />
          <div className="unit-toggle" role="group" aria-label="Duration unit">
            <button
              type="button"
              className={unit === "beats" ? "is-active" : ""}
              aria-pressed={unit === "beats"}
              disabled={!editable || synced}
              onClick={() => setUnit("beats")}
            >
              <AudioLines size={12} aria-hidden="true" />
              Beats
            </button>
            <button
              type="button"
              className={unit === "seconds" ? "is-active" : ""}
              aria-pressed={unit === "seconds"}
              disabled={!editable || synced}
              onClick={() => setUnit("seconds")}
            >
              <Clock size={12} aria-hidden="true" />
              Seconds
            </button>
          </div>
        </div>
      </div>
      <label className="inspector-check">
        <input
          type="checkbox"
          checked={synced}
          disabled={!editable}
          onChange={(event) =>
            update((current) =>
              event.target.checked
                ? ({
                    ...current,
                    syncBeatsToCellSpan: true,
                    durationUnit: "beats",
                    duration: block.length,
                  } as T)
                : ({ ...current, syncBeatsToCellSpan: false } as T),
            )
          }
        />
        Sync beats to cell span
      </label>
    </>
  );
}

export function FadeFields<T extends MediaData>({
  block,
  editable,
  update,
}: {
  block: Placement<T>;
  editable: boolean;
  update: (change: (data: T) => T) => void;
}) {
  const data = block.data;
  return (
    <>
      <label className="inspector-field">
        <span>Fade in</span>
        <PropertyNumber
          key={`fade-in-${block.id}`}
          value={data.fadeIn}
          min={0}
          max={block.length}
          step={1}
          ariaLabel="Fade in"
          disabled={!editable}
          onCommit={(value) =>
            update((current) => {
              const fades = clampFadesToLength(value, current.fadeOut, block.length);
              return { ...current, ...fades };
            })
          }
        />
      </label>
      <label className="inspector-field">
        <span>Fade out</span>
        <PropertyNumber
          key={`fade-out-${block.id}`}
          value={data.fadeOut}
          min={0}
          max={block.length}
          step={1}
          ariaLabel="Fade out"
          disabled={!editable}
          onCommit={(value) =>
            update((current) => {
              const fades = clampFadesToLength(current.fadeIn, value, block.length);
              return { ...current, ...fades };
            })
          }
        />
      </label>
    </>
  );
}

export function ColorField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: Vec3;
  disabled: boolean;
  onCommit: (value: Vec3) => void;
}) {
  return (
    <div className="inspector-field">
      <span>{label}</span>
      <div className="rect-color">
        <span
          className="rect-color-swatch"
          style={{
            background: `rgb(${value[0]}, ${value[1]}, ${value[2]})`,
          }}
          aria-hidden="true"
        />
        <div className="rect-color-fields">
          {(["R", "G", "B"] as const).map((channel, index) => (
            <label key={channel} className="inspector-field">
              <span>{channel}</span>
              <PropertyNumber
                key={`color-${channel}-${index}`}
                value={value[index]}
                min={0}
                max={255}
                step={1}
                ariaLabel={`${label} ${channel}`}
                disabled={disabled}
                onCommit={(next) => {
                  const color: Vec3 = [...value];
                  color[index] = next;
                  onCommit(color);
                }}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SlotPropertyField({
  placementId,
  field,
  label,
  value,
  min,
  max,
  step,
  valueKey,
  boundSlotId,
  trackId,
  editable,
  ariaLabel,
  onCommit,
}: {
  placementId: string;
  field: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueKey: string;
  boundSlotId: string | undefined;
  trackId: string;
  editable: boolean;
  ariaLabel: string;
  onCommit: (value: number) => void;
}) {
  const slots = useExperimentStore((state) => state.slots);
  const tracks = useExperimentStore((state) => state.tracks);
  const setSlotBinding = useExperimentStore((state) => state.setSlotBinding);
  const { local, shared } = slotChoices(slots, tracks, trackId);
  const missingBound =
    boundSlotId !== undefined &&
    ![...local, ...shared].some(({ slot }) => slot.id === boundSlotId);

  return (
    <div className="inspector-field">
      <label htmlFor={`property-${placementId}-${field}-source`}>
        {label}
      </label>
      <select
        id={`property-${placementId}-${field}-source`}
        className="rect-source"
        aria-label={`${ariaLabel} source`}
        value={boundSlotId ?? ""}
        disabled={!editable}
        onChange={(event) => {
          const next = event.target.value;
          setSlotBinding(placementId, field, next === "" ? null : next);
        }}
      >
        <option value="">Number</option>
        {local.length > 0 ? (
          <optgroup label="Track slots">
            {local.map(({ slot, name }) => (
              <option key={slot.id} value={slot.id}>
                {name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {shared.length > 0 ? (
          <optgroup label="Shared slots">
            {shared.map(({ slot, name }) => (
              <option key={slot.id} value={slot.id}>
                {name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {missingBound ? (
          <option value={boundSlotId}>{`${boundSlotId} (unavailable)`}</option>
        ) : null}
      </select>
      <PropertyNumber
        key={`property-${field}-${placementId}-${valueKey}`}
        value={roundTo(value, 3)}
        min={min}
        max={max}
        step={step}
        ariaLabel={ariaLabel}
        disabled={!editable || boundSlotId !== undefined}
        onCommit={onCommit}
      />
    </div>
  );
}

export function OutputSlotField({
  placementId,
  field,
  label,
  trackId,
  boundSlotId,
  editable,
}: {
  placementId: string;
  field: string;
  label: string;
  trackId: string;
  boundSlotId: string | undefined;
  editable: boolean;
}) {
  const slots = useExperimentStore((state) => state.slots);
  const tracks = useExperimentStore((state) => state.tracks);
  const setSlotBinding = useExperimentStore((state) => state.setSlotBinding);
  const { local, shared } = slotChoices(slots, tracks, trackId);
  const missingBound =
    boundSlotId !== undefined &&
    ![...local, ...shared].some(({ slot }) => slot.id === boundSlotId);

  return (
    <div className="inspector-field">
      <label htmlFor={`property-${placementId}-${field}-output`}>{label}</label>
      <select
        id={`property-${placementId}-${field}-output`}
        className="rect-source"
        aria-label={`${label} slot`}
        value={boundSlotId ?? ""}
        disabled={!editable}
        onChange={(event) => {
          const next = event.target.value;
          setSlotBinding(placementId, field, next === "" ? null : next);
        }}
      >
        <option value="">None</option>
        {local.length > 0 ? (
          <optgroup label="Track slots">
            {local.map(({ slot, name }) => (
              <option key={slot.id} value={slot.id}>
                {name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {shared.length > 0 ? (
          <optgroup label="Shared slots">
            {shared.map(({ slot, name }) => (
              <option key={slot.id} value={slot.id}>
                {name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {missingBound ? (
          <option value={boundSlotId}>{`${boundSlotId} (unavailable)`}</option>
        ) : null}
      </select>
    </div>
  );
}

export function slotChoices(
  slots: readonly NumericSlot[],
  tracks: readonly Track[],
  trackId: string,
): {
  local: { slot: NumericSlot; name: string }[];
  shared: { slot: NumericSlot; name: string }[];
} {
  const available = slots
    .map((slot, index) => ({ slot, name: slotDisplayName(slot, index, tracks) }))
    .filter(({ slot }) => slot.trackId === null || slot.trackId === trackId);
  return {
    local: available.filter(({ slot }) => slot.trackId !== null),
    shared: available.filter(({ slot }) => slot.trackId === null),
  };
}

export function slotDisplayName(
  slot: NumericSlot,
  index: number,
  tracks: readonly Track[],
): string {
  const configured = slot.name?.trim();
  if (configured !== undefined && configured !== "") {
    return configured;
  }
  if (slot.trackId === null) {
    return `Shared slot ${index + 1}`;
  }
  const track = tracks.find((candidate) => candidate.id === slot.trackId);
  return track === undefined
    ? `Slot ${index + 1}`
    : `Slot ${index + 1} on ${track.label}`;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
