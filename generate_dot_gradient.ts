export function generateDotGradientSVG(
  w: number,
  h: number,
  dotspan: number,
  r_large: number,
  r_small: number
): string {
  if (w <= 0 || h <= 0 || dotspan <= 0) {
    throw new Error("Dimensions and dotspan must be positive");
  }

  if (r_large < 0 || r_small < 0) {
    throw new Error("Radii must be non-negative");
  }

  const cols = Math.floor(w / dotspan);
  const rows = Math.floor(h / dotspan);

  const circles: string[] = [];

  for (let i = 0; i < cols; i++) {
    const t = cols > 1 ? i / (cols - 1) : 0;

    const r = r_large + (r_small - r_large) * t;
    const x = (i + 0.5) * dotspan;

    for (let j = 0; j < rows; j++) {
      const y = (j + 0.5) * dotspan;

      circles.push(
        `<circle cx="${x}" cy="${y}" r="${r.toFixed(3)}" />`
      );
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    ` width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<g fill="black">`,
    ...circles,
    `</g>`,
    `</svg>`
  ].join("\n");
}
