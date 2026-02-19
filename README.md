# PhyloLens

PhyloLens is a VS Code extension focused on viewing phylogenetic trees across multiple common formats.

## Disclaimer

This project was developed with significant assistance from a large language model (GPT-5 / Codex).

## What It Does

- Adds an `Open Tree Viewer` button in the editor title for supported tree files.
- Adds `Open Tree Viewer` to Explorer right-click for supported tree files.
- Opens a dedicated tree viewer panel beside your text editor.
- Adds a keyboard shortcut: `Ctrl+Alt+P` (`Cmd+Alt+P` on macOS).
- Tree/source sync: click node/branch in viewer -> reveal source in editor.
- Tree/source sync: move cursor in editor -> highlight corresponding node in viewer.

## Screenshots

### Editor Discoverability
Where to find the `Open Tree Viewer` icon in the editor title area.

![Editor discoverability](docs/img/viewer-editor-discoverability.gif)

### Main Viewer
Main viewer layout with title row, controls, and status badges.

![Main viewer](docs/img/viewer-main.png)

### Radial Layout
Radial layout variants and branch-length display.

![Radial layout](docs/img/viewer-radial.png)

### Edit Actions
Tree edit actions (rooting, unrooting, swap, collapse).

![Edit actions](docs/img/viewer-edit-actions.png)

### Search And Export
Search workflow (`Prev/Next/Clear`) and image export controls.

![Search and export](docs/img/viewer-search-export.png)

### Compact Menu Mode
Compact menu mode used on smaller screens.

![Compact menu mode](docs/img/viewer-menu-mode.png)

## Supported File Types

- `.nwk`
- `.newick`
- `.tree`
- `.tre`
- `.treefile`
- `.nex`
- `.nexus`
- `.phyloxml`
- `.xml` (PhyloXML content)
- `.nexml`

## Viewer Features

- Layouts: `Rectangular (lengths)`, `Rectangular (equal)`, `Radial (lengths, curved)`, `Radial (lengths, straight)`, `Radial (equal, curved)`, `Radial (equal, straight)`.
- Zoom and pan with `+`, `-`, mouse wheel, and drag.
- `Fit` view control (centers/fits tree with overlays visible).
- Scale indicator badge + optional scale bar in-canvas.
- Display toggles include branch lengths, scale bar, tip/internal labels, and node shapes.
- Selection-aware actions: root on selected branch, unroot, swap selected node child order, collapse/expand selected clade.
- Global undo (`Ctrl+Z` / `Cmd+Z`) for tree edits and view changes, plus revert-to-original.
- Save edited tree via `Save As...` format dropdown in Newick/NEXUS/PhyloXML/NeXML.
- Export rendered tree to `SVG` or `PNG`.
- Search taxon/node labels with `Prev/Next`, `Clear`, and a match counter.
- Branch hover details (length and descendant tip count).
- Rooted layouts render a short ancestral stem at the root.

## Metadata Badges

Title row badges show:
- source format
- edit sync status vs loaded source file

Bottom status strip badges show:
- rooted/unrooted
- bifurcating/non-bifurcating
- ultrametric/not ultrametric
- scale value
- performance (parse/render timing)

## Install / Run (Dev)

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

## Changelog

- See `CHANGELOG.md` for release history and notable changes.

## Example Trees

All example trees now live under `examples/`.

Small/base examples:
- `examples/comments.nwk`
- `examples/sample.nexml`
- `examples/sample.nexus`
- `examples/sample.nwk`
- `examples/sample.phyloxml`
- `examples/sample.rooted.nwk`
- `examples/polytomy.rooted.nwk`
- `examples/polytomy.unrooted.nwk`
- `examples/polytomy.unrooted.internal.nwk`
- `examples/polytomy.sample.nexus`
- `examples/ultrametric.nwk`

Polytomy note:
- In unrooted mode, the required 3-way display root is not treated as a polytomy.
- `examples/polytomy.unrooted.nwk` shows a top-level unrooted polytomy.
- `examples/polytomy.unrooted.internal.nwk` shows a clearly internal unrooted polytomy.

Rich metadata examples:
- `examples/rich.nexml`
- `examples/rich.nexus`
- `examples/rich.phyloxml`

Large examples:
- `examples/large.nexml`
- `examples/large.nexus`
- `examples/large.nwk`
- `examples/large.phyloxml`
