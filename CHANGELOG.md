# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-16

### Added
- Multi-format tree loading and save support:
  - Newick (`.nwk`, `.newick`, `.tree`, `.tre`, `.treefile`)
  - NEXUS (`.nex`, `.nexus`)
  - PhyloXML (`.phyloxml`, `.xml`)
  - NeXML (`.nexml`)
- Explorer context menu entry (`Open Tree Viewer`) for supported tree files.
- Keyboard shortcut for open viewer (`Ctrl+Alt+P`, `Cmd+Alt+P` on macOS).
- Source format badge and expanded status badges (rooted, bifurcating, ultrametric, scale, perf).
- Additional layouts:
  - Rectangular (lengths/equal)
  - Radial (lengths/equal, curved/straight)
- Tree operations:
  - Root on selected branch
  - Midpoint rooting
  - Least-squares rooting
  - Unroot
  - Swap selected node
  - Collapse/expand selected clade
- Search improvements:
  - Match highlighting for nodes and labels
  - Distinct focused-match color
  - `Prev`, `Next`, and `Clear` controls
- Display options:
  - Show polytomies
  - Show branch lengths
  - Show tip labels
  - Show node labels
  - Show scale bar
  - Show node shapes
  - Hover details
- File and image output:
  - Save As (format-aware)
  - Export SVG
  - Export PNG
- Large-tree UX guardrails:
  - Auto-disable expensive overlays on very large trees
  - Performance badge (parse/render timing)
- Example datasets moved to `examples/`, with small/rich/large examples per format.
- User and developer documentation refresh, including setup guidance.
- Unit/integration tests for parsers, formats, examples, and tree operations.

### Changed
- Consolidated view controls to a single `Fit` action (removed separate reset view button).
- Fit/opening viewport behavior now preserves scale bar visibility and adds better padding.
- Undo evolved into global undo (`Ctrl/Cmd+Z`) covering tree edits and view-state changes.
- Toolbar organization and drag/drop row behavior stabilized.

### Fixed
- Branch-length rendering and radial branch-label placement issues.
- Viewer context retention when switching tabs.
- Export rendering defects and proportion issues in SVG/PNG output.
- Search/selection edge cases:
  - selection synchronization while typing search
  - selection cleared on search clear
  - highlighted nodes remain visible when node shapes are hidden

## [0.0.1] - 2026-02-12

### Added
- Initial extension scaffold and command (`Open Tree Viewer`).
- Newick parser/serializer and basic rectangular tree rendering in webview.
- Initial source synchronization between editor and viewer selection.
