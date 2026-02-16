export function cloneTree(obj) {
    return JSON.parse(JSON.stringify(obj));
}
export function structuralChildren(node) {
    if (!node) {
        return [];
    }
    const visible = Array.isArray(node.children) ? node.children : [];
    if (visible.length > 0) {
        return visible;
    }
    return Array.isArray(node._collapsedChildren) ? node._collapsedChildren : [];
}
export function findNodeById(root, targetId) {
    if (!root || !targetId) {
        return null;
    }
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) {
            continue;
        }
        if (node.id === targetId) {
            return node;
        }
        const children = Array.isArray(node.children) ? node.children : [];
        for (const child of children) {
            stack.push(child);
        }
        const collapsedChildren = Array.isArray(node._collapsedChildren) ? node._collapsedChildren : [];
        for (const child of collapsedChildren) {
            stack.push(child);
        }
    }
    return null;
}
export function expandAllCollapsed(node) {
    if (!node) {
        return;
    }
    if (!Array.isArray(node.children)) {
        node.children = [];
    }
    if (Array.isArray(node._collapsedChildren) && node._collapsedChildren.length > 0) {
        node.children = node._collapsedChildren;
        delete node._collapsedChildren;
    }
    for (const child of node.children) {
        expandAllCollapsed(child);
    }
}
export function countTips(root) {
    if (!root) {
        return 0;
    }
    let count = 0;
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) {
            continue;
        }
        const children = structuralChildren(node);
        if (children.length === 0) {
            count += 1;
            continue;
        }
        for (const child of children) {
            stack.push(child);
        }
    }
    return count;
}
export function canToggleCollapseAtNode(root, nodeId) {
    if (!root || !nodeId) {
        return false;
    }
    const node = findNodeById(root, nodeId);
    if (!node) {
        return false;
    }
    const visibleChildren = Array.isArray(node.children) ? node.children.length : 0;
    const collapsedChildren = Array.isArray(node._collapsedChildren) ? node._collapsedChildren.length : 0;
    return visibleChildren > 0 || collapsedChildren > 0;
}
export function toggleCollapseAtNode(root, nodeId) {
    const tree = cloneTree(root);
    const node = findNodeById(tree, nodeId);
    if (!node) {
        return tree;
    }
    const visibleChildren = Array.isArray(node.children) ? node.children : [];
    const collapsedChildren = Array.isArray(node._collapsedChildren) ? node._collapsedChildren : [];
    if (collapsedChildren.length > 0) {
        node.children = collapsedChildren;
        delete node._collapsedChildren;
        return tree;
    }
    if (visibleChildren.length > 0) {
        node._collapsedChildren = visibleChildren;
        node.children = [];
    }
    return tree;
}
export function swapNodeChildren(root, nodeId) {
    const tree = cloneTree(root);
    const node = findNodeById(tree, nodeId);
    if (!node) {
        return tree;
    }
    const visibleChildren = Array.isArray(node.children) ? node.children : [];
    const collapsedChildren = Array.isArray(node._collapsedChildren) ? node._collapsedChildren : [];
    if (visibleChildren.length >= 2) {
        node.children = visibleChildren.slice().reverse();
    }
    else if (collapsedChildren.length >= 2) {
        node._collapsedChildren = collapsedChildren.slice().reverse();
    }
    return tree;
}
export function rerootTree(tree, targetId) {
    const graph = buildTreeGraph(tree);
    if (!graph.nodeById.has(targetId)) {
        return null;
    }
    let anchorId = graph.parentById.get(targetId) || null;
    let edgeLength = null;
    // If selected node is current root, use any incident edge as reroot anchor.
    if (anchorId === null) {
        const neighbors = graph.adjacency.get(targetId) || [];
        if (neighbors.length === 0) {
            return cloneTree(tree);
        }
        anchorId = neighbors[0].to;
        edgeLength = neighbors[0].length;
    }
    else {
        edgeLength = findEdgeLength(graph.adjacency, targetId, anchorId);
    }
    const splitLength = Number.isFinite(edgeLength) ? Number(edgeLength) / 2 : null;
    const left = buildRootedFrom(graph, targetId, anchorId, splitLength);
    const right = buildRootedFrom(graph, anchorId, targetId, splitLength);
    const syntheticRoot = {
        id: createSyntheticRootId(graph.nodeById),
        name: "",
        length: null,
        children: [left, right],
        start: tree.start,
        end: tree.end,
    };
    return collapseUnaryNodes(syntheticRoot, true);
}
export function unrootTree(tree) {
    const root = cloneTree(tree);
    if (!root || !Array.isArray(root.children) || root.children.length !== 2) {
        return root;
    }
    const left = root.children[0];
    const right = root.children[1];
    const pivot = left.children.length >= right.children.length ? left : right;
    const sibling = pivot === left ? right : left;
    const newRoot = {
        id: root.id,
        name: root.name || "",
        length: null,
        children: [],
        start: root.start,
        end: root.end,
    };
    if (pivot.children.length > 0) {
        for (const child of pivot.children) {
            newRoot.children.push(cloneTree(child));
        }
        const liftedSibling = cloneTree(sibling);
        liftedSibling.length = mergeBranchLengths(pivot.length, sibling.length);
        newRoot.children.push(liftedSibling);
    }
    else {
        const leftChild = cloneTree(left);
        leftChild.length = null;
        const rightChild = cloneTree(right);
        rightChild.length = mergeBranchLengths(left.length, right.length);
        newRoot.children.push(leftChild, rightChild);
    }
    return collapseUnaryNodes(newRoot, true);
}
export function midpointRootTree(tree) {
    const graph = buildTreeGraph(tree);
    const tips = listTipIds(graph.nodeById);
    if (tips.length < 2) {
        return cloneTree(tree);
    }
    let bestA = null;
    let bestB = null;
    let bestDistance = -1;
    for (let i = 0; i < tips.length; i += 1) {
        const from = tips[i];
        const distances = shortestDistancesFrom(graph, from);
        for (let j = i + 1; j < tips.length; j += 1) {
            const to = tips[j];
            const d = distances.get(to);
            if (!Number.isFinite(d)) {
                continue;
            }
            if (Number(d) > bestDistance) {
                bestDistance = Number(d);
                bestA = from;
                bestB = to;
            }
        }
    }
    if (!bestA || !bestB || bestDistance <= 0) {
        return cloneTree(tree);
    }
    const path = findPath(graph, bestA, bestB);
    if (!path || path.edges.length === 0) {
        return cloneTree(tree);
    }
    const target = bestDistance / 2;
    let walked = 0;
    for (const edge of path.edges) {
        const len = edge.length;
        if (walked + len >= target) {
            const along = target - walked;
            const fraction = len > 0 ? clamp01(along / len) : 0.5;
            return rerootOnEdgeAtFraction(graph, edge.from, edge.to, fraction, tree);
        }
        walked += len;
    }
    const last = path.edges[path.edges.length - 1];
    return rerootOnEdgeAtFraction(graph, last.from, last.to, 0.5, tree);
}
export function leastSquaresRootTree(tree) {
    const graph = buildTreeGraph(tree);
    const tips = listTipIds(graph.nodeById);
    if (tips.length < 2) {
        return cloneTree(tree);
    }
    const nodeIds = Array.from(graph.nodeById.keys());
    const distCache = new Map();
    const getDistances = (nodeId) => {
        const cached = distCache.get(nodeId);
        if (cached) {
            return cached;
        }
        const next = shortestDistancesFrom(graph, nodeId);
        distCache.set(nodeId, next);
        return next;
    };
    let bestScore = Infinity;
    let bestCandidate = null;
    const samples = 20;
    for (const u of nodeIds) {
        const edges = graph.adjacency.get(u) || [];
        for (const edge of edges) {
            const v = edge.to;
            if (u >= v) {
                continue;
            }
            const L = numericLength(edge.length);
            const distU = getDistances(u);
            const distV = getDistances(v);
            for (let i = 0; i <= samples; i += 1) {
                const t = i / samples;
                const dists = [];
                for (const tip of tips) {
                    const du = distU.get(tip);
                    const dv = distV.get(tip);
                    if (!Number.isFinite(du) || !Number.isFinite(dv)) {
                        continue;
                    }
                    // In a tree, exactly one side gives the true path; min() is robust even
                    // when one endpoint distance includes crossing the candidate edge.
                    const rootToTip = Math.min(t * L + Number(du), (1 - t) * L + Number(dv));
                    dists.push(rootToTip);
                }
                if (dists.length < 2) {
                    continue;
                }
                const score = variance(dists);
                if (score < bestScore) {
                    bestScore = score;
                    bestCandidate = { u, v, t };
                }
            }
        }
    }
    if (!bestCandidate) {
        return cloneTree(tree);
    }
    return rerootOnEdgeAtFraction(graph, bestCandidate.u, bestCandidate.v, bestCandidate.t, tree);
}
function buildTreeGraph(tree) {
    const nodeById = new Map();
    const adjacency = new Map();
    const parentById = new Map();
    traverse(tree, null);
    return {
        nodeById,
        adjacency,
        parentById,
    };
    function traverse(node, parentId) {
        nodeById.set(node.id, node);
        if (!adjacency.has(node.id)) {
            adjacency.set(node.id, []);
        }
        if (parentId !== null) {
            parentById.set(node.id, parentId);
        }
        for (const child of node.children) {
            const length = Number.isFinite(child.length) ? child.length : null;
            if (!adjacency.has(child.id)) {
                adjacency.set(child.id, []);
            }
            adjacency.get(node.id)?.push({ to: child.id, length });
            adjacency.get(child.id)?.push({ to: node.id, length });
            traverse(child, node.id);
        }
    }
}
function findEdgeLength(adjacency, fromId, toId) {
    const edges = adjacency.get(fromId) || [];
    const match = edges.find((edge) => edge.to === toId);
    return match ? match.length : null;
}
function buildRootedFrom(graph, currentId, parentId, incomingLength) {
    const original = graph.nodeById.get(currentId);
    if (!original) {
        throw new Error(`Missing node '${currentId}' in graph`);
    }
    const next = {
        id: original.id,
        name: original.name,
        length: incomingLength,
        children: [],
        start: original.start,
        end: original.end,
    };
    const neighbors = graph.adjacency.get(currentId) || [];
    for (const edge of neighbors) {
        if (edge.to === parentId) {
            continue;
        }
        const child = buildRootedFrom(graph, edge.to, currentId, edge.length);
        next.children.push(child);
    }
    return next;
}
function collapseUnaryNodes(node, isRoot) {
    const collapsedChildren = (node.children || []).map((child) => collapseUnaryNodes(child, false));
    const next = {
        ...node,
        children: collapsedChildren,
    };
    // Rerooting can leave unary artifacts where the old root path gets expanded.
    // Collapse them while preserving total path length to avoid topology noise.
    if (!isRoot && next.children.length === 1) {
        const onlyChild = next.children[0];
        onlyChild.length = mergeBranchLengths(next.length, onlyChild.length);
        if (next.name && !onlyChild.name) {
            onlyChild.name = next.name;
        }
        return onlyChild;
    }
    if (isRoot && next.children.length === 1) {
        const onlyChild = next.children[0];
        onlyChild.length = null;
        if (next.name && !onlyChild.name) {
            onlyChild.name = next.name;
        }
        return onlyChild;
    }
    return next;
}
function createSyntheticRootId(nodeById) {
    if (!nodeById.has("root")) {
        return "root";
    }
    let index = 1;
    while (nodeById.has(`root_${index}`)) {
        index += 1;
    }
    return `root_${index}`;
}
function mergeBranchLengths(a, b) {
    const hasA = Number.isFinite(a);
    const hasB = Number.isFinite(b);
    if (hasA && hasB) {
        return Number(a) + Number(b);
    }
    if (hasA) {
        return Number(a);
    }
    if (hasB) {
        return Number(b);
    }
    return null;
}
function listTipIds(nodeById) {
    const out = [];
    for (const [id, node] of nodeById.entries()) {
        if ((node.children || []).length === 0) {
            out.push(id);
        }
    }
    return out;
}
function shortestDistancesFrom(graph, startId) {
    const dist = new Map();
    const stack = [{ id: startId, parent: null, d: 0 }];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }
        dist.set(current.id, current.d);
        const edges = graph.adjacency.get(current.id) || [];
        for (const edge of edges) {
            if (edge.to === current.parent) {
                continue;
            }
            stack.push({
                id: edge.to,
                parent: current.id,
                d: current.d + numericLength(edge.length),
            });
        }
    }
    return dist;
}
function findPath(graph, fromId, toId) {
    const parent = new Map();
    const stack = [{ id: fromId, prev: null, len: 0 }];
    parent.set(fromId, { prev: null, len: 0 });
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }
        if (current.id === toId) {
            break;
        }
        const edges = graph.adjacency.get(current.id) || [];
        for (const edge of edges) {
            if (parent.has(edge.to)) {
                continue;
            }
            parent.set(edge.to, { prev: current.id, len: numericLength(edge.length) });
            stack.push({ id: edge.to, prev: current.id, len: numericLength(edge.length) });
        }
    }
    if (!parent.has(toId)) {
        return null;
    }
    const reversed = [];
    let cur = toId;
    while (cur !== fromId) {
        const info = parent.get(cur);
        if (!info || !info.prev) {
            return null;
        }
        reversed.push({ from: info.prev, to: cur, length: info.len });
        cur = info.prev;
    }
    reversed.reverse();
    return { edges: reversed };
}
function rerootOnEdgeAtFraction(graph, u, v, t, tree) {
    const edgeLength = findEdgeLength(graph.adjacency, u, v);
    const L = Number.isFinite(edgeLength) ? Math.max(0, Number(edgeLength)) : 1;
    const leftLength = L * clamp01(t);
    const rightLength = L - leftLength;
    const left = buildRootedFrom(graph, u, v, leftLength);
    const right = buildRootedFrom(graph, v, u, rightLength);
    const syntheticRoot = {
        id: createSyntheticRootId(graph.nodeById),
        name: "",
        length: null,
        children: [left, right],
        start: tree.start,
        end: tree.end,
    };
    return collapseUnaryNodes(syntheticRoot, true);
}
function variance(values) {
    if (values.length <= 1) {
        return 0;
    }
    let sum = 0;
    for (const v of values) {
        sum += v;
    }
    const mean = sum / values.length;
    let ss = 0;
    for (const v of values) {
        const d = v - mean;
        ss += d * d;
    }
    return ss / values.length;
}
function numericLength(length) {
    if (Number.isFinite(length)) {
        return Math.max(0, Number(length));
    }
    return 1;
}
function clamp01(v) {
    if (!Number.isFinite(v)) {
        return 0.5;
    }
    return Math.max(0, Math.min(1, v));
}
