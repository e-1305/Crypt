// Pure helpers for the visual QA check (scripts/ci/visual-qa.mjs). No browser needed, so vitest covers them.

/** True when two {x,y,width,height} boxes share more than `tol` pixels on both axes. */
export function intersects(a, b, tol = 1) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > tol && h > tol;
}

/** Every pair of named boxes that overlap. `boxes` is an array of {name, x, y, width, height}. */
export function findOverlaps(boxes, tol = 1) {
  const out = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (intersects(boxes[i], boxes[j], tol)) out.push([boxes[i].name, boxes[j].name]);
    }
  }
  return out;
}
