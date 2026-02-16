import { strict as assert } from "node:assert";
import {
  TreeNodeOps,
  canToggleCollapseAtNode,
  cloneTree,
  countTips,
  expandAllCollapsed,
  findNodeById,
  leastSquaresRootTree,
  midpointRootTree,
  rerootTree,
  structuralChildren,
  swapNodeChildren,
  toggleCollapseAtNode,
  unrootTree,
} from "../tree-ops";
import { parseNewick } from "../newick";

function asOpsTree(newick: string): TreeNodeOps {
  return parseNewick(newick) as unknown as TreeNodeOps;
}

function run(): void {
  const base = asOpsTree("((Human:0.2,Chimpanzee:0.2)Primates:0.3,(Mouse:0.5,Rat:0.45)Rodents:0.1)Mammals;");

  assert.equal(countTips(base), 4);
  assert.equal(structuralChildren(base).length, 2);

  const primates = findNodeById(base, base.children[0].id);
  assert.ok(primates);
  assert.equal(primates?.name, "Primates");

  const swapped = swapNodeChildren(base, base.children[0].id);
  assert.equal(swapped.children[0].children[0].name, "Chimpanzee");
  assert.equal(swapped.children[0].children[1].name, "Human");

  const collapsed = toggleCollapseAtNode(base, base.children[0].id);
  const collapsedTarget = findNodeById(collapsed, base.children[0].id);
  assert.ok(collapsedTarget);
  assert.equal(collapsedTarget?.children.length, 0);
  assert.ok(Array.isArray(collapsedTarget?._collapsedChildren));
  assert.equal(canToggleCollapseAtNode(collapsed, base.children[0].id), true);

  const expanded = cloneTree(collapsed);
  expandAllCollapsed(expanded);
  const expandedTarget = findNodeById(expanded, base.children[0].id);
  assert.equal(expandedTarget?.children.length, 2);

  const rerooted = rerootTree(base, base.children[1].id);
  assert.ok(rerooted);
  assert.equal(rerooted?.children.length, 2);
  assert.equal(countTips(rerooted || base), 4);

  const unrooted = unrootTree(base);
  assert.equal(countTips(unrooted), 4);

  const invalid = rerootTree(base, "missing-id");
  assert.equal(invalid, null);

  const midpointRooted = midpointRootTree(base);
  assert.ok(midpointRooted);
  assert.equal(midpointRooted?.children.length, 2);
  assert.equal(countTips(midpointRooted || base), 4);

  const lsRooted = leastSquaresRootTree(base);
  assert.ok(lsRooted);
  assert.equal(lsRooted?.children.length, 2);
  assert.equal(countTips(lsRooted || base), 4);

  console.log("tree-ops tests passed");
}

run();
