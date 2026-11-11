const LOOP_LEVEL_HUES = [258, 222, 186, 150, 114, 78] as const;

export interface LoopLevelColor {
  readonly line: string;
  readonly fill: string;
  readonly barFill: string;
  readonly text: string;
}

export function loopLevelHue(depth: number): number {
  const index = Math.min(
    Math.max(0, Math.floor(depth)),
    LOOP_LEVEL_HUES.length - 1,
  );
  return LOOP_LEVEL_HUES[index];
}

export function loopLevelColor(depth: number): LoopLevelColor {
  const hue = loopLevelHue(depth);
  return {
    line: `hsl(${hue} 80% 60%)`,
    fill: `hsl(${hue} 80% 60% / 0.08)`,
    barFill: `hsl(${hue} 80% 55% / 0.14)`,
    text: `hsl(${hue} 65% 38%)`,
  };
}
