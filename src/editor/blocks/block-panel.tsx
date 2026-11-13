import { Fragment } from "react";
import type {
  BlockDefinition,
  EntryContext,
  PanelField,
  PanelSection,
} from "../block-definition";
import { panelSections } from "../block-definition";
import type { Placement } from "../model";
import {
  ColorField,
  DurationFields,
  FadeFields,
  OutputSlotField,
  PropertyNumber,
  SlotPropertyField,
} from "./panel-widgets";

export interface BlockPanelProps {
  readonly definition: BlockDefinition;
  readonly block: Placement;
  readonly context: EntryContext;
  readonly editable: boolean;
  readonly update: (change: (data: unknown) => unknown) => void;
  readonly setCooperativeSkip: (value: boolean) => void;
}

const SECTION_LABELS: Record<PanelSection, string> = {
  input: "Input",
  block: "Block",
  output: "Output",
};

export function BlockPanel({
  definition,
  block,
  context,
  editable,
  update,
  setCooperativeSkip,
}: BlockPanelProps) {
  const sections = panelSections(definition);
  return (
    <div className="block-panel">
      {sections.map((section, index) => (
        <Fragment key={section.section}>
          {index > 0 ? (
            <span className="panel-connector" aria-hidden="true" />
          ) : null}
          <section
            className={`panel-section panel-${section.section}`}
            aria-label={SECTION_LABELS[section.section]}
          >
            <h4 className="panel-title">{SECTION_LABELS[section.section]}</h4>
            {section.fields.map((field) => (
              <FieldView
                key={field.key}
                field={field}
                block={block}
                context={context}
                editable={editable}
                update={update}
              />
            ))}
            {section.section === "block" ? (
              <label className="inspector-check">
                <input
                  type="checkbox"
                  checked={block.cooperativeSkip}
                  disabled={!editable}
                  onChange={(event) => setCooperativeSkip(event.target.checked)}
                />
                Cooperative skip
              </label>
            ) : null}
          </section>
        </Fragment>
      ))}
    </div>
  );
}

function FieldView({
  field,
  block,
  context,
  editable,
  update,
}: {
  field: PanelField<unknown>;
  block: Placement;
  context: EntryContext;
  editable: boolean;
  update: (change: (data: unknown) => unknown) => void;
}) {
  switch (field.kind) {
    case "number": {
      const limits = field.limits?.(block.data) ?? {
        min: field.min,
        max: field.max,
        step: field.step ?? 1,
      };
      if (field.section === "input" && field.slot) {
        return (
          <SlotPropertyField
            placementId={block.id}
            field={field.key}
            label={field.label}
            value={field.value(block.data)}
            min={limits.min}
            max={limits.max}
            step={limits.step}
            valueKey={`${limits.min}:${limits.max}:${limits.step}`}
            boundSlotId={block.slotBindings?.[field.key]}
            trackId={block.trackId}
            editable={editable}
            ariaLabel={field.label}
            onCommit={(value) =>
              update((data) => field.commit(data, value))
            }
          />
        );
      }
      return (
        <div className="inspector-field">
          <span>{field.label}</span>
          <PropertyNumber
            value={field.value(block.data)}
            min={limits.min}
            max={limits.max}
            step={limits.step}
            ariaLabel={field.label}
            disabled={!editable}
            onCommit={(value) =>
              update((data) => field.commit(data, value))
            }
          />
        </div>
      );
    }
    case "color":
      return (
        <ColorField
          label={field.label}
          value={field.value(block.data)}
          disabled={!editable}
          onCommit={(color) => update((data) => field.commit(data, color))}
        />
      );
    case "duration":
      return (
        <DurationFields
          field={field}
          block={block}
          context={context}
          editable={editable}
          update={update}
        />
      );
    case "fades":
      return (
        <FadeFields
          field={field}
          block={block}
          context={context}
          editable={editable}
          update={update}
        />
      );
    case "choice": {
      const selected = field.value(block.data);
      const enabled = field.enabled(context);
      return (
        <div className="inspector-field">
          <span>{field.label}</span>
          <div className="unit-toggle" role="group" aria-label={field.label}>
            {field.choices.map((choice) => {
              const Icon = choice.icon;
              return (
                <button
                  key={choice.value}
                  type="button"
                  className={choice.value === selected ? "is-active" : ""}
                  aria-pressed={choice.value === selected}
                  disabled={!editable || !enabled}
                  onClick={() =>
                    update((data) => choice.commit(data, context))
                  }
                >
                  <Icon size={12} aria-hidden="true" />
                  {choice.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case "output":
      return (
        <OutputSlotField
          placementId={block.id}
          field={field.key}
          label={field.label}
          trackId={block.trackId}
          boundSlotId={block.slotBindings?.[field.key]}
          editable={editable}
        />
      );
    case "note":
      return <p className="inspector-note">{field.text}</p>;
    case "custom": {
      const Custom = field.render;
      return <Custom block={block} editable={editable} update={update} />;
    }
  }
}
