# PhyloLens Developer Notes

This document explains how PhyloLens is implemented and where to modify behavior.

## Development Setup

### Linux (Ubuntu/Mint/Debian-style)

1. Install Node.js 20+ and npm.
2. Open `PhyloLens` in VS Code.
3. Run:

```bash
npm install
npm run compile
```

4. Press `F5` to launch the Extension Development Host.

### Windows (PowerShell)

1. Install Node.js 20+ (LTS) and VS Code.
2. Open `PhyloLens` folder in VS Code.
3. In PowerShell:

```powershell
npm install
npm run compile
```

4. Press `F5` to launch the Extension Development Host.

### Daily Dev Commands

- `npm run compile`: build extension host + webview modules once
- `npm run watch`: watch TypeScript for extension host
- `npm run watch:web`: watch TypeScript for browser/shared modules
- `npm test`: compile + run parser/format/tree-op tests

## Architecture

PhyloLens has two main parts:

- Extension host (`src/extension.ts`)
- Viewer webview (`media/viewer.js`, `media/viewer.css`)

### Extension Host Responsibilities

- Registers command: `phylolens.openViewer`
- Validates active/target file extension
- Opens/reveals one viewer panel per document URI
- Parses supported formats (`parseTreeText`) on document changes
- Sends parsed tree payload to webview
- Handles webview messages:
  - `revealRange` (sync to editor selection)
  - `saveTreeAs` (format-aware serialize + write)
  - `exportSvg` / `exportPng` (save exported assets)

### Webview Responsibilities

- Maintains viewer state (`workingTree`, selection, layout, toggles, zoom/pan, undo stack)
- Renders tree to SVG for rectangular + radial layouts
- Handles node/edge interactions and toolbar actions
- Performs in-view tree operations (swap, root, unroot, collapse)
- Tracks sync status against original parsed tree
- Applies large-tree guardrails (auto-disables expensive overlays)
- Drives tree save from a single `Save As...` format dropdown (toolbar mode) or format submenu (compact menu mode)

## Data Model

`TreeNode` (shared model) from `src/newick.ts`:

- `id`, `name`, `length`, `children`, `start`, `end`

`start/end` track source offsets for source-view synchronization.

## Rendering Pipeline (Webview)

1. Receive parsed tree payload from extension host.
2. Deep-clone into:
   - `sourceTree` (baseline)
   - `workingTree` (editable view state)
3. Build layout-specific node/edge view model.
4. Emit SVG groups:
   - geometry (edges, nodes)
   - labels (tips, internal labels, branch lengths)
   - overlay (scale bar)
   - rooted-only ancestral stem at the root
5. Bind interaction handlers on node circles and edge hit-paths.
6. Apply viewport transform for zoom/pan.

## Tree Operations

Shared operation logic lives in `src/tree-ops.ts` and is covered by unit tests.
Webview runtime imports the browser-built module at `media/generated/tree-ops.js`.
The web build is produced by `tsc -p tsconfig.web.json`.

- `rerootTree(...)`
- `midpointRootTree(...)`
- `leastSquaresRootTree(...)`
- `unrootTree(...)`
- `swapNodeChildren(...)`
- `toggleCollapseAtNode(...)`
- structural helpers (`findNodeById`, `countTips`, `expandAllCollapsed`, etc.)

Tree metrics helpers (`formatLength`, `isBifurcating`, `isUltrametric`, node counting)
are now in `media/tree-metrics.js` as the first step of viewer modularization.
For unrooted trees, bifurcation logic treats the single 3-way display root as expected
and does not classify that alone as a polytomy.

## Format Adapters

Format parsing/serialization now lives in `src/formats.ts`:

- Newick (including NHX/comment stripping)
- NEXUS (TREES block + TRANSLATE support)
- PhyloXML (clade/name/branch_length subset)
- NeXML (node/edge tree subset)

All adapters map into the same `TreeNode` structure.
Serialization is intentionally conservative: core tree structure is preserved,
but rich format-specific metadata may be normalized.

## Toolbar Layout Drag/Drop

- Only movable rows (`.header-row-movable`) participate.
- Top title/meta row is fixed.
- Sections are draggable via `.section-label` handle.
- Arrangement is persisted with `vscode.setState(...)`.

## Search + Selection

- Search matches node labels (tips + internal labels if present)
- `Prev/Next` cycle matches
- Counter displays `current/total`
- Selection info pill summarizes node/branch context

## Exports

- SVG export clones current SVG and injects export-safe style block.
- PNG export rasterizes cloned SVG onto canvas and sends data URL to extension host.

## Tests

Tests live in `src/test`:

- `newick.test.ts`
- `newick.extra.test.ts`
- `formats.test.ts`
- `examples.test.ts`
- `tree-ops.test.ts`

Run:

```bash
npm test
```

Automated tests now cover parser/serializer format adapters plus core tree operation invariants.

## Suggested Next Refactor

To improve testability and long-term safety:

1. Extend operation tests with additional edge cases (zero/absent lengths, large polytomies, repeated reroot/unroot cycles).
2. Strengthen XML adapter coverage with richer fixture files (metadata-heavy PhyloXML/NeXML).
3. Optionally split `formats.ts` into per-format modules once parser surface grows further.
