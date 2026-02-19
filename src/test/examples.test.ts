import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseTreeText } from "../formats";
import { TreeNode } from "../newick";

function countTips(node: TreeNode): number {
  if (node.children.length === 0) {
    return 1;
  }
  return node.children.reduce((sum, child) => sum + countTips(child), 0);
}

function run(): void {
  const examplesDir = path.resolve(__dirname, "../../examples");
  const files = [
    "sample.nwk",
    "comments.nwk",
    "sample.rooted.nwk",
    "polytomy.rooted.nwk",
    "polytomy.unrooted.nwk",
    "polytomy.unrooted.internal.nwk",
    "ultrametric.nwk",
    "large.nwk",
    "sample.nexus",
    "polytomy.sample.nexus",
    "rich.nexus",
    "large.nexus",
    "sample.phyloxml",
    "rich.phyloxml",
    "large.phyloxml",
    "sample.nexml",
    "rich.nexml",
    "large.nexml",
  ];

  for (const file of files) {
    const filePath = path.join(examplesDir, file);
    const text = fs.readFileSync(filePath, "utf8");
    const parsed = parseTreeText(text, filePath);
    assert.ok(parsed.root);
    assert.ok(countTips(parsed.root) >= 2);
  }

  console.log("example file tests passed");
}

run();
