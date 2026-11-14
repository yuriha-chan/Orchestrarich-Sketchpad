export type DurationUnit = "beats" | "seconds";

export function blockDurationSeconds(
  duration: number,
  unit: DurationUnit,
  bpm: number,
): number {
  return unit === "beats" ? beatsToSeconds(duration, bpm) : duration;
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}

export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}

export function convertDuration(
  value: number,
  from: DurationUnit,
  to: DurationUnit,
  bpm: number,
): number {
  if (from === to) {
    return value;
  }
  return from === "beats"
    ? beatsToSeconds(value, bpm)
    : secondsToBeats(value, bpm);
}
