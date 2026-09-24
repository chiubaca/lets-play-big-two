import { BufferGeometry, ExtrudeGeometry, Path, Shape, ShapeUtils, Vector2 } from "three";

// Rebuild the GLB's front face with a wider, rounded bevel for the small home logo.
export function logoGoldGeometry(source: BufferGeometry) {
  const positions = source.getAttribute("position");
  const indices = source.index;
  const edges = new Map<string, [string, string]>();
  const points = new Map<string, Vector2>();
  source.computeBoundingBox();
  const front = source.boundingBox!.max.z;
  const count = indices?.count ?? positions.count;

  for (let index = 0; index < count; index += 3) {
    const triangle = [0, 1, 2].map((offset) => indices?.getX(index + offset) ?? index + offset);
    if (triangle.some((vertex) => Math.abs(positions.getZ(vertex) - front) > 0.001)) continue;
    const keys = triangle.map((vertex) => {
      const x = positions.getX(vertex);
      const y = positions.getY(vertex);
      const key = `${x.toFixed(4)},${y.toFixed(4)}`;
      points.set(key, new Vector2(x, y));
      return key;
    });
    for (let edge = 0; edge < 3; edge++) {
      const a = keys[edge];
      const b = keys[(edge + 1) % 3];
      const key = [a, b].sort().join("|");
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [a, b]);
    }
  }

  const next = new Map(edges.values());
  const contours: Vector2[][] = [];
  while (next.size) {
    const start = next.keys().next().value!;
    let current = start;
    const contour: Vector2[] = [];
    do {
      contour.push(points.get(current)!);
      const following = next.get(current);
      next.delete(current);
      if (!following) break;
      current = following;
    } while (current !== start);
    contours.push(contour);
  }

  contours.sort((a, b) => Math.abs(ShapeUtils.area(b)) - Math.abs(ShapeUtils.area(a)));
  const shape = new Shape(contours[0]);
  shape.holes = contours.slice(1).map((contour) => new Path(contour));
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelSize: 0.18,
    bevelThickness: 0.14,
    bevelSegments: 5,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, 0.08);
  return geometry;
}
