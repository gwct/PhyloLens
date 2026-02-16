import { strict as assert } from "node:assert";
import { parseNewick, serializeNewick } from "../newick";

function run(): void {
  const parsed = parseNewick("((Human:0.1,Chimpanzee:0.1)Primates:0.2,Mouse:0.5)Mammals;");
  assert.equal(parsed.name, "Mammals");
  assert.equal(parsed.children.length, 2);
  assert.equal(parsed.children[0].name, "Primates");

  const roundTrip = serializeNewick(parsed);
  assert.equal(roundTrip, "((Human:0.1,Chimpanzee:0.1)Primates:0.2,Mouse:0.5)Mammals;");

  const quoted = parseNewick("('A taxon''s label':1.25,B:2)Root;");
  assert.equal(quoted.children[0].name, "A taxon's label");
  assert.equal(serializeNewick(quoted), "('A taxon''s label':1.25,B:2)Root;");

  assert.throws(() => parseNewick("(A:0.1,B:bad)R;"), /Invalid branch length/);
  assert.throws(() => parseNewick("(A:0.1,B:0.2)R extra"), /Unexpected token/);

  console.log("newick tests passed");
}

run();
