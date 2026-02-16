export interface TreeNode {
  id: string;
  name: string;
  length: number | null;
  children: TreeNode[];
  start: number;
  end: number;
}

interface ParseState {
  text: string;
  index: number;
  idCounter: number;
}

const LABEL_STOP = new Set([",", "(", ")", ":", ";"]);

export function parseNewick(text: string): TreeNode {
  const state: ParseState = {
    text,
    index: 0,
    idCounter: 0,
  };

  skipWhitespace(state);
  const root = parseSubtree(state);
  skipWhitespace(state);

  if (peek(state) === ";") {
    state.index += 1;
    skipWhitespace(state);
  }

  if (state.index < state.text.length) {
    throw new Error(`Unexpected token at offset ${state.index}`);
  }

  return root;
}

export function serializeNewick(root: TreeNode): string {
  return `${serializeNode(root)};`;
}

function serializeNode(node: TreeNode): string {
  let out = "";

  if (node.children.length > 0) {
    out += `(${node.children.map((child) => serializeNode(child)).join(",")})`;
  }

  if (node.name.length > 0) {
    out += serializeLabel(node.name);
  }

  if (node.length !== null) {
    out += `:${formatLength(node.length)}`;
  }

  return out;
}

function serializeLabel(label: string): string {
  if (/^[^\s\(\)\[\]':;,]+$/.test(label)) {
    return label;
  }

  const escaped = label.replaceAll("'", "''");
  return `'${escaped}'`;
}

function formatLength(length: number): string {
  if (!Number.isFinite(length)) {
    return "0";
  }

  // Keep a compact, deterministic decimal representation.
  return Number(length.toPrecision(12)).toString();
}

function parseSubtree(state: ParseState): TreeNode {
  skipWhitespace(state);
  const start = state.index;

  let children: TreeNode[] = [];
  if (peek(state) === "(") {
    state.index += 1;
    skipWhitespace(state);

    children.push(parseSubtree(state));
    skipWhitespace(state);

    while (peek(state) === ",") {
      state.index += 1;
      skipWhitespace(state);
      children.push(parseSubtree(state));
      skipWhitespace(state);
    }

    if (peek(state) !== ")") {
      throw new Error(`Expected ')' at offset ${state.index}`);
    }
    state.index += 1;
  }

  skipWhitespace(state);
  const name = parseLabel(state);

  skipWhitespace(state);
  let length: number | null = null;
  if (peek(state) === ":") {
    state.index += 1;
    const rawLength = parseLengthToken(state);
    if (rawLength.length === 0) {
      throw new Error(`Missing branch length at offset ${state.index}`);
    }
    const parsed = Number(rawLength);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid branch length '${rawLength}' at offset ${state.index}`);
    }
    length = parsed;
  }

  const end = state.index;

  return {
    id: `n${state.idCounter++}`,
    name,
    length,
    children,
    start,
    end,
  };
}

function parseLabel(state: ParseState): string {
  const current = peek(state);
  if (!current) {
    return "";
  }

  if (current === "'") {
    state.index += 1;
    let out = "";

    while (state.index < state.text.length) {
      const ch = state.text[state.index];
      if (ch === "'") {
        const next = state.text[state.index + 1];
        if (next === "'") {
          out += "'";
          state.index += 2;
          continue;
        }

        state.index += 1;
        return out;
      }

      out += ch;
      state.index += 1;
    }

    throw new Error("Unterminated quoted label");
  }

  let out = "";
  while (state.index < state.text.length) {
    const ch = state.text[state.index];
    if (LABEL_STOP.has(ch) || /\s/.test(ch)) {
      break;
    }
    out += ch;
    state.index += 1;
  }

  return out;
}

function parseLengthToken(state: ParseState): string {
  let out = "";
  while (state.index < state.text.length) {
    const ch = state.text[state.index];
    if (ch === "," || ch === ")" || ch === ";" || /\s/.test(ch)) {
      break;
    }
    out += ch;
    state.index += 1;
  }
  return out;
}

function skipWhitespace(state: ParseState): void {
  while (state.index < state.text.length && /\s/.test(state.text[state.index])) {
    state.index += 1;
  }
}

function peek(state: ParseState): string | undefined {
  return state.text[state.index];
}
