// Shared outlines for the relief and Leaflet. These bends are illustrative.
// A fixed seed keeps the coast stable between builds.
export function organicOutline(points, amplitude = 1.2, seed = 1830) {
  const result = [];
  const sample = (index, salt) => {
    let value = Math.imul(index ^ salt, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff * 2 - 1;
  };
  const noiseAt = (position, salt) => {
    const cell = Math.floor(position), t = position - cell;
    const blend = t * t * (3 - 2 * t);
    return sample(cell, salt) * (1 - blend) + sample(cell + 1, salt) * blend;
  };
  let distance = 0;
  const count = points.length;
  for (let i = 0; i < count; i++) {
    const a = points[(i + count - 1) % count], b = points[i];
    const c = points[(i + 1) % count], d = points[(i + 2) % count];
    const steps = Math.max(4, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 1.5));
    for (let j = 0; j < steps; j++) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      const at = b.map((v, k) => .5 * (2*v + (-a[k]+c[k])*t
        + (2*a[k]-5*v+4*c[k]-d[k])*t2 + (-a[k]+3*v-3*c[k]+d[k])*t3));
      const dx = c[0] - b[0], dy = c[1] - b[1], length = Math.hypot(dx, dy);
      const s = distance + length * t;
      const noise = (noiseAt(s / 14, seed) + .5 * noiseAt(s / 6, seed + 167)
        + .25 * noiseAt(s / 2.5, seed + 337)) / 1.75;
      // Keep source anchors fixed. Add detail between them.
      const bend = amplitude * noise * Math.sin(Math.PI*t) ** 2;
      result.push([at[0] - dy/length*bend, at[1] + dx/length*bend]);
    }
    distance += Math.hypot(c[0] - b[0], c[1] - b[1]);
  }
  return result;
}

// A smooth curve through every point of an open line, such as a river course.
// The source points stay on the curve.
export function smoothCourse(points, stepsPerSegment = 8) {
  const result = [];
  const last = points.length - 1;
  for (let i = 0; i < last; i++) {
    const a = points[Math.max(i - 1, 0)], b = points[i];
    const c = points[i + 1], d = points[Math.min(i + 2, last)];
    for (let j = 0; j < stepsPerSegment; j++) {
      const t = j / stepsPerSegment, t2 = t * t, t3 = t2 * t;
      result.push(b.map((v, k) => .5 * (2*v + (-a[k]+c[k])*t
        + (2*a[k]-5*v+4*c[k]-d[k])*t2 + (-a[k]+3*v-3*c[k]+d[k])*t3)));
    }
  }
  result.push(points[last]);
  return result;
}
