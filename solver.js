// Traducción directa del grafo del IR (Line → DivideCurve → EvaluateCurve → Distance → Circle → Loft).
// Sin kernel: para este grafo todo es analítico, así que no hace falta rhino3dm para dibujar.
export const SEGMENTS = 64;
const TAU = Math.PI * 2;

export function solve(p) {
  const n = Math.max(1, Math.round(p.seccNum));
  const [ox, oy, oz] = p.origin;
  const zEval = oz + p.altura * p.posAtrac;

  // DivideCurve: n tramos => n+1 puntos; Distance punto a punto; Circle de radio |z - zEval|
  const circles = Array.from({ length: n + 1 }, (_, i) => {
    const z = oz + (p.altura * i) / n;
    return { c: [ox, oy, z], r: Math.abs(z - zEval) };
  });

  // Loft: banda de quads entre anillos consecutivos
  const positions = new Float32Array(circles.length * SEGMENTS * 3);
  circles.forEach(({ c, r }, i) => {
    for (let k = 0; k < SEGMENTS; k++) {
      const a = (TAU * k) / SEGMENTS;
      const o = (i * SEGMENTS + k) * 3;
      positions[o] = c[0] + r * Math.cos(a);
      positions[o + 1] = c[1] + r * Math.sin(a);
      positions[o + 2] = c[2];
    }
  });

  const indices = [];
  for (let i = 0; i < circles.length - 1; i++) {
    for (let k = 0; k < SEGMENTS; k++) {
      const a = i * SEGMENTS + k;
      const b = i * SEGMENTS + ((k + 1) % SEGMENTS);
      indices.push(a, a + SEGMENTS, b, b, a + SEGMENTS, b + SEGMENTS);
    }
  }

  return { positions, indices: Uint32Array.from(indices), circles };
}

export function ringPoints({ c, r }, k = 0) {
  const a = (TAU * k) / SEGMENTS;
  return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2]];
}
