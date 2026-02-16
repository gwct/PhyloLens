import { strict as assert } from "node:assert";
import { parseNewick, serializeNewick } from "../newick";

function run(): void {
  // Accept missing trailing semicolon and trim surrounding whitespace.
  const noSemi = parseNewick("  (A:1,B:1)R  ");
  assert.equal(noSemi.name, "R");
  assert.equal(noSemi.children.length, 2);
  assert.equal(serializeNewick(noSemi), "(A:1,B:1)R;");

  // Preserve deterministic floating formatting.
  const floatTree = parseNewick("(A:0.3333333333333333,B:2.5)R;");
  assert.equal(serializeNewick(floatTree), "(A:0.333333333333,B:2.5)R;");

  // Quote labels that require quoting during serialization.
  const tricky = parseNewick("('taxon a':1,'x:y':2)root;");
  assert.equal(serializeNewick(tricky), "('taxon a':1,'x:y':2)root;");

  // Error surfaces.
  assert.throws(() => parseNewick("(A:,B:1)R;"), /Missing branch length/);
  assert.throws(() => parseNewick("('unterminated:1,B:1)R;"), /Unterminated quoted label/);

  console.log("newick extra tests passed");
}

run();
