import { strict as assert } from "node:assert";
import {
  detectFormatFromPath,
  inferFormatForSave,
  parseTreeText,
  serializeTreeByFormat,
  TreeFormatId,
} from "../formats";
import { TreeNode } from "../newick";

function countTips(node: TreeNode): number {
  if (node.children.length === 0) {
    return 1;
  }
  return node.children.reduce((sum, child) => sum + countTips(child), 0);
}

function tipNames(node: TreeNode): string[] {
  if (node.children.length === 0) {
    return [node.name];
  }
  return node.children.flatMap((child) => tipNames(child));
}

function parseAndAssert(text: string, fileName: string, expectedFormat: TreeFormatId, expectedTips: number): TreeNode {
  const parsed = parseTreeText(text, fileName);
  assert.equal(parsed.format, expectedFormat);
  assert.equal(countTips(parsed.root), expectedTips);
  return parsed.root;
}

function run(): void {
  const newickWithComments = "([&R](A[&&NHX:S=human]:0.1,B:0.2)X:0.3,C:0.4)Root;";
  const parsedNewick = parseAndAssert(newickWithComments, "example.nwk", "newick", 3);
  assert.deepEqual(tipNames(parsedNewick).sort(), ["A", "B", "C"]);

  const nexus = `#NEXUS
BEGIN TREES;
  TRANSLATE
    1 Human,
    2 Chimpanzee,
    3 Mouse,
    4 Rat
  ;
  TREE t1 = [&R]((1:0.2,2:0.2):0.3,(3:0.5,4:0.45):0.1);
END;`;
  const parsedNexus = parseAndAssert(nexus, "example.nex", "nexus", 4);
  assert.deepEqual(tipNames(parsedNexus).sort(), ["Chimpanzee", "Human", "Mouse", "Rat"]);

  const phyloXml = `<?xml version="1.0" encoding="UTF-8"?>
<phyloxml xmlns="http://www.phyloxml.org">
  <phylogeny rooted="true">
    <clade>
      <name>Mammals</name>
      <clade><name>Human</name><branch_length>0.2</branch_length></clade>
      <clade><name>Chimpanzee</name><branch_length>0.2</branch_length></clade>
    </clade>
  </phylogeny>
</phyloxml>`;
  const parsedPhyloXml = parseAndAssert(phyloXml, "example.phyloxml", "phyloxml", 2);
  assert.deepEqual(tipNames(parsedPhyloXml).sort(), ["Chimpanzee", "Human"]);

  const nexml = `<?xml version="1.0" encoding="UTF-8"?>
<nex:nexml xmlns:nex="http://www.nexml.org/2009" version="0.9">
  <trees id="trees1">
    <tree id="tree1">
      <node id="n0" label="Mammals" root="true"/>
      <node id="n1" label="Human"/>
      <node id="n2" label="Chimpanzee"/>
      <edge id="e1" source="n0" target="n1" length="0.2"/>
      <edge id="e2" source="n0" target="n2" length="0.2"/>
    </tree>
  </trees>
</nex:nexml>`;
  const parsedNeXml = parseAndAssert(nexml, "example.nexml", "nexml", 2);
  assert.deepEqual(tipNames(parsedNeXml).sort(), ["Chimpanzee", "Human"]);

  const serNexus = serializeTreeByFormat(parsedNexus, "nexus");
  assert.match(serNexus, /#NEXUS/i);
  assert.equal(parseTreeText(serNexus, "saved.nexus").format, "nexus");

  const serPhyloXml = serializeTreeByFormat(parsedPhyloXml, "phyloxml");
  assert.match(serPhyloXml, /<phyloxml\b/i);
  assert.equal(parseTreeText(serPhyloXml, "saved.phyloxml").format, "phyloxml");

  const serNeXml = serializeTreeByFormat(parsedNeXml, "nexml");
  assert.match(serNeXml, /<nex:nexml\b/i);
  assert.equal(parseTreeText(serNeXml, "saved.nexml").format, "nexml");

  assert.equal(detectFormatFromPath("x.nwk"), "newick");
  assert.equal(detectFormatFromPath("x.treefile"), "newick");
  assert.equal(detectFormatFromPath("x.nex"), "nexus");
  assert.equal(detectFormatFromPath("x.phyloxml"), "phyloxml");
  assert.equal(detectFormatFromPath("x.nexml"), "nexml");
  assert.equal(inferFormatForSave("x.unknown", "newick"), "newick");
  assert.equal(inferFormatForSave("x.nex", "newick"), "nexus");

  assert.throws(
    () => parseTreeText("(\nA:0.1,\nB:bad\n)Root;", "broken.nwk"),
    /line 3, column \d+/i
  );

  console.log("formats tests passed");
}

run();
