export function formatLength(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.001) {
    return value.toExponential(2);
  }
  if (abs >= 1000) {
    return value.toFixed(1);
  }
  return Number(value.toPrecision(4)).toString();
}

export function countTreeNodes(tree, getChildren) {
  if (!tree) {
    return 0;
  }
  const stack = [tree];
  let count = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    count += 1;
    const children = getChildren(node);
    for (const child of children) {
      stack.push(child);
    }
  }
  return count;
}

export function isBifurcating(tree, getChildren) {
  if (!tree) {
    return null;
  }
  const stack = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    const children = getChildren(node);
    if (children.length > 0 && children.length !== 2) {
      return false;
    }
    for (const child of children) {
      stack.push(child);
    }
  }
  return true;
}

export function isUltrametric(tree, getChildren) {
  if (!tree) {
    return null;
  }
  const distances = [];
  const stack = [{ node: tree, dist: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !current.node) {
      continue;
    }
    const children = getChildren(current.node);
    if (children.length === 0) {
      distances.push(current.dist);
      continue;
    }
    for (const child of children) {
      const len = Number.isFinite(child.length) ? Math.max(0, Number(child.length)) : 1;
      stack.push({ node: child, dist: current.dist + len });
    }
  }

  if (distances.length < 2) {
    return null;
  }

  let minD = distances[0];
  let maxD = distances[0];
  for (const d of distances) {
    if (d < minD) {
      minD = d;
    }
    if (d > maxD) {
      maxD = d;
    }
  }

  const scale = Math.max(1, Math.abs(maxD), Math.abs(minD));
  const tol = scale * 1e-6;
  return Math.abs(maxD - minD) <= tol;
}
