import { TreeNode, parseNewick, serializeNewick } from "./newick";

export type TreeFormatId = "newick" | "nexus" | "phyloxml" | "nexml";

export interface ParseResult {
  root: TreeNode;
  format: TreeFormatId;
}

interface TreeFormat {
  id: TreeFormatId;
  label: string;
  extensions: string[];
  detectScore: (text: string) => number;
  parse: (text: string) => TreeNode;
  serialize: (tree: TreeNode) => string;
}

interface XmlNode {
  name: string;
  attrs: Map<string, string>;
  children: XmlNode[];
  text: string;
}

const FORMATS: TreeFormat[] = [
  {
    id: "newick",
    label: "Newick",
    extensions: [".nwk", ".newick", ".tree", ".tre", ".treefile"],
    detectScore: detectNewick,
    parse: parseExtendedNewick,
    serialize: (tree) => serializeNewick(tree),
  },
  {
    id: "nexus",
    label: "NEXUS",
    extensions: [".nex", ".nexus"],
    detectScore: detectNexus,
    parse: parseNexus,
    serialize: (tree) => serializeNexus(tree),
  },
  {
    id: "phyloxml",
    label: "PhyloXML",
    extensions: [".phyloxml", ".xml"],
    detectScore: detectPhyloXml,
    parse: parsePhyloXml,
    serialize: (tree) => serializePhyloXml(tree),
  },
  {
    id: "nexml",
    label: "NeXML",
    extensions: [".nexml"],
    detectScore: detectNeXml,
    parse: parseNeXml,
    serialize: (tree) => serializeNeXml(tree),
  },
];

export function getAllSupportedExtensions(): string[] {
  const set = new Set<string>();
  for (const fmt of FORMATS) {
    for (const ext of fmt.extensions) {
      set.add(ext);
    }
  }
  return Array.from(set);
}

export function getSaveDialogFilters(): Record<string, string[]> {
  return {
    "Newick files": ["nwk", "newick", "tree", "tre", "treefile"],
    "NEXUS files": ["nex", "nexus"],
    "PhyloXML files": ["phyloxml", "xml"],
    "NeXML files": ["nexml"],
  };
}

export function parseTreeText(text: string, filePath?: string): ParseResult {
  const ext = (filePath || "").toLowerCase();
  const byExtension = FORMATS.find((fmt) => fmt.extensions.some((suffix) => ext.endsWith(suffix)));
  if (byExtension) {
    return parseWithFormat(byExtension, text);
  }

  const ranked = FORMATS.map((fmt) => ({ fmt, score: fmt.detectScore(text) })).sort((a, b) => b.score - a.score);
  for (const candidate of ranked) {
    if (candidate.score <= 0) {
      continue;
    }
    try {
      return parseWithFormat(candidate.fmt, text);
    } catch {
      // Try next format candidate.
    }
  }

  // Final fallback preserves previous behavior for unknown extension files.
  return {
    root: parseWithFormat(FORMATS[0], text).root,
    format: "newick",
  };
}

function parseWithFormat(format: TreeFormat, text: string): ParseResult {
  try {
    return {
      root: format.parse(text),
      format: format.id,
    };
  } catch (error) {
    throw enrichParseError(error, text, format.label);
  }
}

function enrichParseError(error: unknown, text: string, formatLabel: string): Error {
  const raw = error instanceof Error ? error.message : String(error);
  const offsetMatch = raw.match(/\boffset\s+(\d+)\b/i);
  if (!offsetMatch) {
    return new Error(`${formatLabel} parse error: ${raw}`);
  }
  const offset = Number(offsetMatch[1]);
  if (!Number.isFinite(offset) || offset < 0) {
    return new Error(`${formatLabel} parse error: ${raw}`);
  }
  const pos = lineColAtOffset(text, offset);
  return new Error(`${formatLabel} parse error at line ${pos.line}, column ${pos.column}: ${raw}`);
}

function lineColAtOffset(text: string, offset: number): { line: number; column: number } {
  const bounded = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < bounded; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return {
    line,
    column: bounded - lineStart + 1,
  };
}

export function detectFormatFromPath(filePath: string): TreeFormatId | null {
  const lower = filePath.toLowerCase();
  const match = FORMATS.find((fmt) => fmt.extensions.some((suffix) => lower.endsWith(suffix)));
  return match ? match.id : null;
}

export function serializeTreeByFormat(tree: TreeNode, format: TreeFormatId): string {
  const fmt = FORMATS.find((candidate) => candidate.id === format);
  if (!fmt) {
    return serializeNewick(tree);
  }
  return fmt.serialize(tree);
}

export function inferFormatForSave(pathLike: string, fallback: TreeFormatId): TreeFormatId {
  return detectFormatFromPath(pathLike) || fallback;
}

function detectNewick(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  if (/^[\(\[]/.test(trimmed) && /;/.test(trimmed)) {
    return 20;
  }
  if (/^\s*\(/.test(trimmed)) {
    return 12;
  }
  return 0;
}

function detectNexus(text: string): number {
  if (/^\s*#nexus/i.test(text)) {
    return 100;
  }
  if (/begin\s+trees\s*;/i.test(text) && /tree\s+[^=]+=/i.test(text)) {
    return 80;
  }
  return 0;
}

function detectPhyloXml(text: string): number {
  if (/<phyloxml\b/i.test(text)) {
    return 100;
  }
  if (/<phylogeny\b/i.test(text) && /<clade\b/i.test(text)) {
    return 70;
  }
  return 0;
}

function detectNeXml(text: string): number {
  if (/<(?:nex:)?nexml\b/i.test(text)) {
    return 100;
  }
  if (/<tree\b/i.test(text) && /<edge\b/i.test(text) && /<node\b/i.test(text)) {
    return 70;
  }
  return 0;
}

function parseExtendedNewick(text: string): TreeNode {
  // NHX/comments extension: remove [ ... ] comments while preserving quoted labels.
  const cleaned = stripNewickComments(text).replace(/^\s*\[&[RU]\]\s*/i, "");
  return parseNewick(cleaned);
}

function stripNewickComments(text: string): string {
  let out = "";
  let i = 0;
  let inQuote = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuote) {
      out += ch;
      if (ch === "'") {
        if (text[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        inQuote = false;
      }
      i += 1;
      continue;
    }

    if (ch === "'") {
      inQuote = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "[") {
      i += 1;
      let depth = 1;
      while (i < text.length && depth > 0) {
        if (text[i] === "'") {
          i += 1;
          while (i < text.length) {
            if (text[i] === "'") {
              if (text[i + 1] === "'") {
                i += 2;
                continue;
              }
              i += 1;
              break;
            }
            i += 1;
          }
          continue;
        }
        if (text[i] === "[") {
          depth += 1;
        } else if (text[i] === "]") {
          depth -= 1;
        }
        i += 1;
      }
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function parseNexus(text: string): TreeNode {
  const treeMatch = text.match(/tree\s+[^=]+=\s*([\s\S]*?;)/i);
  if (!treeMatch) {
    throw new Error("NEXUS parse error: no TREE statement found in TREES block");
  }

  let newickText = treeMatch[1].trim();
  newickText = newickText.replace(/^\[&[^\]]+\]\s*/i, "");

  const translateMap = new Map<string, string>();
  const translateMatch = text.match(/translate\s+([\s\S]*?);/i);
  if (translateMatch) {
    const entries = splitByCommaOutsideQuotes(translateMatch[1]);
    for (const entry of entries) {
      const m = entry.trim().match(/^(\S+)\s+(.+)$/);
      if (!m) {
        continue;
      }
      const key = unquoteToken(m[1]);
      const value = unquoteToken(m[2].trim());
      if (key.length > 0 && value.length > 0) {
        translateMap.set(key, value);
      }
    }
  }

  const root = parseExtendedNewick(newickText);
  if (translateMap.size > 0) {
    applyTipNameMap(root, translateMap);
  }
  return root;
}

function serializeNexus(tree: TreeNode): string {
  return `#NEXUS

BEGIN TREES;
  TREE phylolens = ${serializeNewick(tree)}
END;
`;
}

function parsePhyloXml(text: string): TreeNode {
  // Intentionally supports a practical subset: phylogeny/clade/name/branch_length.
  // Unknown metadata tags are ignored and do not block loading.
  const xmlRoot = parseSimpleXml(text);
  const phylogeny = findFirstElement(xmlRoot, "phylogeny");
  if (!phylogeny) {
    throw new Error("PhyloXML parse error: missing <phylogeny> element");
  }
  const clade = findFirstDirectChild(phylogeny, "clade");
  if (!clade) {
    throw new Error("PhyloXML parse error: missing root <clade> element");
  }

  let idCounter = 0;
  return parsePhyloXmlClade(clade, () => `n${idCounter++}`);
}

function parsePhyloXmlClade(clade: XmlNode, nextId: () => string): TreeNode {
  const nameNode = findFirstDirectChild(clade, "name");
  const lengthNode = findFirstDirectChild(clade, "branch_length");

  const children = clade.children.filter((child) => child.name === "clade").map((child) => parsePhyloXmlClade(child, nextId));
  const lengthValue = lengthNode ? Number(lengthNode.text.trim()) : NaN;

  return {
    id: nextId(),
    name: nameNode ? nameNode.text.trim() : "",
    length: Number.isFinite(lengthValue) ? lengthValue : null,
    children,
    start: 0,
    end: 0,
  };
}

function serializePhyloXml(tree: TreeNode): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<phyloxml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.phyloxml.org">
  <phylogeny rooted="true">
${serializePhyloXmlClade(tree, 4)}
  </phylogeny>
</phyloxml>
`;
}

function serializePhyloXmlClade(node: TreeNode, indent: number): string {
  const pad = " ".repeat(indent);
  const pieces: string[] = [];
  pieces.push(`${pad}<clade>`);
  if (node.name) {
    pieces.push(`${pad}  <name>${escapeXml(node.name)}</name>`);
  }
  if (Number.isFinite(node.length)) {
    pieces.push(`${pad}  <branch_length>${Number(node.length)}</branch_length>`);
  }
  for (const child of node.children) {
    pieces.push(serializePhyloXmlClade(child, indent + 2));
  }
  pieces.push(`${pad}</clade>`);
  return pieces.join("\n");
}

function parseNeXml(text: string): TreeNode {
  // Intentionally supports the common node/edge representation for one rooted tree.
  // Rich metadata is tolerated but not mapped into the TreeNode model.
  const xmlRoot = parseSimpleXml(text);
  const treeEl = findFirstElement(xmlRoot, "tree");
  if (!treeEl) {
    throw new Error("NeXML parse error: missing <tree> element");
  }

  const nodeEls = findDirectChildren(treeEl, "node");
  const edgeEls = findDirectChildren(treeEl, "edge");
  if (nodeEls.length === 0) {
    throw new Error("NeXML parse error: tree contains no <node> elements");
  }

  const nodeById = new Map<string, TreeNode>();
  for (const nodeEl of nodeEls) {
    const id = attr(nodeEl, "id");
    if (!id) {
      continue;
    }
    nodeById.set(id, {
      id,
      name: attr(nodeEl, "label") || "",
      length: null,
      children: [],
      start: 0,
      end: 0,
    });
  }

  const incoming = new Map<string, number>();
  for (const edgeEl of edgeEls) {
    const source = attr(edgeEl, "source");
    const target = attr(edgeEl, "target");
    if (!source || !target) {
      continue;
    }
    const parent = nodeById.get(source);
    const child = nodeById.get(target);
    if (!parent || !child) {
      continue;
    }
    const len = Number(attr(edgeEl, "length"));
    child.length = Number.isFinite(len) ? len : null;
    parent.children.push(child);
    incoming.set(target, (incoming.get(target) || 0) + 1);
  }

  const explicitRoot = nodeEls
    .map((nodeEl) => attr(nodeEl, "id"))
    .filter((id): id is string => Boolean(id))
    .find((id) => {
      const el = nodeEls.find((candidate) => attr(candidate, "id") === id);
      return Boolean(el) && /^true$/i.test(attr(el as XmlNode, "root") || "");
    });

  const rootId =
    explicitRoot ||
    nodeEls
      .map((nodeEl) => attr(nodeEl, "id"))
      .filter((id): id is string => Boolean(id))
      .find((id) => !incoming.has(id));

  if (!rootId || !nodeById.has(rootId)) {
    throw new Error("NeXML parse error: unable to determine root node");
  }

  return cloneTreeNode(nodeById.get(rootId) as TreeNode);
}

function serializeNeXml(tree: TreeNode): string {
  const allNodes: TreeNode[] = [];
  const edges: Array<{ source: string; target: string; length: number | null }> = [];
  traverseTree(tree, null, allNodes, edges);

  const tips = allNodes.filter((node) => node.children.length === 0);
  const otuLines = tips
    .map((tip, idx) => `    <otu id="otu${idx + 1}" label="${escapeXml(tip.name || tip.id)}"/>`)
    .join("\n");

  const nodeLines = allNodes
    .map((node) => {
      const attrs = [`id="${escapeXml(node.id)}"`];
      if (node.name) {
        attrs.push(`label="${escapeXml(node.name)}"`);
      }
      if (node.id === tree.id) {
        attrs.push(`root="true"`);
      }
      return `      <node ${attrs.join(" ")}/>`;
    })
    .join("\n");

  const edgeLines = edges
    .map((edge, idx) => {
      const attrs = [`id="e${idx + 1}"`, `source="${escapeXml(edge.source)}"`, `target="${escapeXml(edge.target)}"`];
      if (Number.isFinite(edge.length)) {
        attrs.push(`length="${Number(edge.length)}"`);
      }
      return `      <edge ${attrs.join(" ")}/>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<nex:nexml xmlns:nex="http://www.nexml.org/2009" version="0.9">
  <otus id="otus1">
${otuLines}
  </otus>
  <trees id="trees1">
    <tree id="tree1" otus="otus1">
${nodeLines}
${edgeLines}
    </tree>
  </trees>
</nex:nexml>
`;
}

function splitByCommaOutsideQuotes(text: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'") {
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (ch === "," && !inQuote) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim().length > 0) {
    parts.push(cur);
  }
  return parts;
}

function unquoteToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed;
}

function applyTipNameMap(root: TreeNode, byOldName: Map<string, string>): void {
  const stack: TreeNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    if (node.children.length === 0) {
      const mapped = byOldName.get(node.name);
      if (mapped) {
        node.name = mapped;
      }
    }
    for (const child of node.children) {
      stack.push(child);
    }
  }
}

function parseSimpleXml(text: string): XmlNode {
  const root: XmlNode = {
    name: "__root__",
    attrs: new Map<string, string>(),
    children: [],
    text: "",
  };
  const stack: XmlNode[] = [root];
  const tokenRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[^>]+>|[^<]+/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(text)) !== null) {
    const token = match[0];
    const tokenOffset = match.index;
    if (token.startsWith("<?") || token.startsWith("<!--")) {
      continue;
    }
    if (token.startsWith("<![CDATA[")) {
      const cdata = token.slice(9, -3);
      stack[stack.length - 1].text += cdata;
      continue;
    }
    if (token.startsWith("</")) {
      const closeName = normalizeTagName(token.slice(2, -1));
      const top = stack.pop();
      if (!top || top.name !== closeName) {
        throw new Error(`XML parse error: mismatched closing tag </${closeName}> at offset ${tokenOffset}`);
      }
      continue;
    }
    if (token.startsWith("<")) {
      const selfClosing = /\/>\s*$/.test(token);
      const raw = token.slice(1, selfClosing ? -2 : -1).trim();
      if (raw.length === 0) {
        continue;
      }
      const nameMatch = raw.match(/^([^\s/>]+)/);
      if (!nameMatch) {
        continue;
      }
      const name = normalizeTagName(nameMatch[1]);
      const attrText = raw.slice(nameMatch[1].length);
      const node: XmlNode = {
        name,
        attrs: parseXmlAttrs(attrText),
        children: [],
        text: "",
      };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) {
        stack.push(node);
      }
      continue;
    }
    const txt = token.trim();
    if (txt.length > 0) {
      stack[stack.length - 1].text += (stack[stack.length - 1].text.length > 0 ? " " : "") + decodeXmlEntities(txt);
    }
  }

  if (stack.length !== 1) {
    throw new Error(`XML parse error: unclosed tags at offset ${text.length}`);
  }
  return root;
}

function parseXmlAttrs(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(raw)) !== null) {
    const key = normalizeTagName(match[1]);
    const value = decodeXmlEntities(match[3] ?? match[4] ?? "");
    out.set(key, value);
  }
  return out;
}

function normalizeTagName(name: string): string {
  return name.replace(/^.*:/, "").toLowerCase();
}

function decodeXmlEntities(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function findFirstElement(root: XmlNode, name: string): XmlNode | null {
  const needle = name.toLowerCase();
  const stack: XmlNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    if (node.name === needle) {
      return node;
    }
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      stack.push(node.children[i]);
    }
  }
  return null;
}

function findFirstDirectChild(root: XmlNode, name: string): XmlNode | null {
  const needle = name.toLowerCase();
  return root.children.find((child) => child.name === needle) || null;
}

function findDirectChildren(root: XmlNode, name: string): XmlNode[] {
  const needle = name.toLowerCase();
  return root.children.filter((child) => child.name === needle);
}

function attr(node: XmlNode, name: string): string | null {
  return node.attrs.get(name.toLowerCase()) || null;
}

function cloneTreeNode(node: TreeNode): TreeNode {
  return {
    id: node.id,
    name: node.name,
    length: node.length,
    children: node.children.map((child) => cloneTreeNode(child)),
    start: 0,
    end: 0,
  };
}

function traverseTree(
  node: TreeNode,
  parentId: string | null,
  nodes: TreeNode[],
  edges: Array<{ source: string; target: string; length: number | null }>
): void {
  nodes.push(node);
  if (parentId) {
    edges.push({
      source: parentId,
      target: node.id,
      length: node.length,
    });
  }
  for (const child of node.children) {
    traverseTree(child, node.id, nodes, edges);
  }
}
