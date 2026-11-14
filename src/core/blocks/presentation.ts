export type StageLayer = "screen" | "card";

export interface StageDialogueCard {
  readonly id: string;
  readonly type: "dialogue";
  readonly layer: "card";
  readonly label: string;
  readonly text: string;
  readonly confirm: () => void;
}

export interface StageAnimationPlayback {
  readonly positionMs: number;
  readonly playing: boolean;
}

export interface StageAnimationCard {
  readonly id: string;
  readonly type: "animation";
  readonly layer: "card";
  readonly label: string;
  readonly durationMs: number;
  readonly fadeInFraction: number;
  readonly fadeOutFraction: number;
  readonly playback: StageAnimationPlayback;
}

export type StageRectUnit = "span" | "pixels";

export type StageRgb = readonly [number, number, number];

export interface StageRectangle {
  readonly id: string;
  readonly type: "rectangle";
  readonly layer: "screen";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly unit: StageRectUnit;
  readonly color: StageRgb;
}

export type StagePrimitive =
  | StageDialogueCard
  | StageAnimationCard
  | StageRectangle;

export interface StageActions {
  readonly addDialogue: (card: StageDialogueCard) => void;
  readonly addAnimation: (card: StageAnimationCard) => void;
  readonly addRectangle: (rectangle: StageRectangle) => void;
  readonly updateAnimationPlayback: (
    id: string,
    playback: StageAnimationPlayback,
  ) => void;
  readonly remove: (id: string) => void;
}
