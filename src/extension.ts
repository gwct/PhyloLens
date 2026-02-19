import * as path from "path";
import * as vscode from "vscode";
import {
  TreeFormatId,
  detectFormatFromPath,
  getAllSupportedExtensions,
  getSaveDialogFilters,
  getSaveDialogFiltersForFormat,
  inferFormatForSave,
  parseTreeText,
  serializeTreeByFormat,
} from "./formats";
import { TreeNode } from "./newick";

const SUPPORTED_EXTENSIONS = new Set(getAllSupportedExtensions());
const VIEW_TYPE = "phylolens.viewer";

interface ViewerState {
  panel: vscode.WebviewPanel;
  document: vscode.TextDocument;
  sourceFormat: TreeFormatId;
}

interface WebviewMessage {
  type: string;
  start?: number;
  end?: number;
  tree?: TreeNode;
  svg?: string;
  pngDataUrl?: string;
  savedPath?: string;
  level?: "info" | "warning" | "error";
  text?: string;
  format?: TreeFormatId;
}

const viewersByDocument = new Map<string, ViewerState>();

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("phylolens.openViewer", async (targetUri?: vscode.Uri) => {
      // Command can come from the active editor, Command Palette, or Explorer context menu.
      const docFromUri = targetUri ? await vscode.workspace.openTextDocument(targetUri) : null;
      const activeDoc = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document : null;
      const document = docFromUri || activeDoc;
      if (!document) {
        vscode.window.showInformationMessage("Open a supported tree file first.");
        return;
      }

      const ext = path.extname(document.uri.fsPath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        vscode.window.showWarningMessage("The active file is not a supported tree file.");
        return;
      }

      openOrRevealViewer(context, document);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const viewer = viewersByDocument.get(event.document.uri.toString());
      if (!viewer) {
        return;
      }

      publishTree(viewer.document, viewer.panel);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      const key = event.textEditor.document.uri.toString();
      const viewer = viewersByDocument.get(key);
      if (!viewer) {
        return;
      }

      const offset = event.textEditor.document.offsetAt(event.selections[0].active);
      viewer.panel.webview.postMessage({
        type: "cursorOffset",
        offset,
      });
    })
  );
}

function openOrRevealViewer(context: vscode.ExtensionContext, document: vscode.TextDocument): void {
  const key = document.uri.toString();
  const existing = viewersByDocument.get(key);

  if (existing) {
    existing.panel.reveal(vscode.ViewColumn.Beside, true);
    publishTree(document, existing.panel);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    `PhyloLens: ${path.basename(document.uri.fsPath)}`,
    {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
    },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = getWebviewHtml(context, panel.webview, path.basename(document.uri.fsPath));
  const sourceFormat = detectFormatFromPath(document.uri.fsPath) || "newick";
  viewersByDocument.set(key, { panel, document, sourceFormat });

  panel.onDidDispose(() => {
    viewersByDocument.delete(key);
  });

  panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
    if (!msg || typeof msg.type !== "string") {
      return;
    }

    if (msg.type === "revealRange") {
      revealRangeInEditor(document, key, msg);
      return;
    }

    if (msg.type === "saveTreeAs") {
      const source = viewersByDocument.get(key);
      const sourceFormatId = source ? source.sourceFormat : "newick";
      const savedPath = await saveTreeAs(msg.tree, sourceFormatId, msg.format);
      if (savedPath) {
        panel.webview.postMessage({
          type: "saveTreeAsResult",
          savedPath,
        });
      }
      return;
    }

    if (msg.type === "exportSvg") {
      await saveSvg(msg.svg);
      return;
    }

    if (msg.type === "exportPng") {
      await savePng(msg.pngDataUrl);
      return;
    }

    if (msg.type === "notify") {
      const text = typeof msg.text === "string" ? msg.text : "";
      if (!text) {
        return;
      }
      const level = msg.level || "info";
      if (level === "warning") {
        vscode.window.showWarningMessage(text);
      } else if (level === "error") {
        vscode.window.showErrorMessage(text);
      } else {
        vscode.window.showInformationMessage(text);
      }
      return;
    }
  });

  publishTree(document, panel);
}

function revealRangeInEditor(document: vscode.TextDocument, key: string, msg: WebviewMessage): void {
  const editor = vscode.window.visibleTextEditors.find((candidate) => candidate.document.uri.toString() === key);
  if (!editor) {
    return;
  }

  const start = Number(msg.start);
  const end = Number(msg.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return;
  }

  const selection = new vscode.Selection(document.positionAt(start), document.positionAt(end));
  editor.selection = selection;
  editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

async function saveTreeAs(
  tree: TreeNode | undefined,
  sourceFormat: TreeFormatId,
  requestedFormat: TreeFormatId | undefined
): Promise<string | null> {
  if (!tree) {
    vscode.window.showWarningMessage("No tree data available to save.");
    return null;
  }

  const effectiveFormat = requestedFormat || sourceFormat;
  const target = await vscode.window.showSaveDialog({
    title: "Save Edited Tree As",
    filters: requestedFormat ? getSaveDialogFiltersForFormat(requestedFormat) : getSaveDialogFilters(),
    saveLabel: "Save Tree",
  });

  if (!target) {
    return null;
  }

  const format = requestedFormat || inferFormatForSave(target.fsPath, effectiveFormat);
  const text = serializeTreeByFormat(tree, format);
  await vscode.workspace.fs.writeFile(target, Buffer.from(text, "utf8"));
  vscode.window.showInformationMessage(`Saved tree to ${target.fsPath}`);
  return target.fsPath;
}

async function saveSvg(svg: string | undefined): Promise<void> {
  if (!svg || svg.trim().length === 0) {
    vscode.window.showWarningMessage("No SVG data available to export.");
    return;
  }

  const target = await vscode.window.showSaveDialog({
    title: "Export Tree as SVG",
    filters: {
      "SVG files": ["svg"],
    },
    saveLabel: "Export SVG",
  });

  if (!target) {
    return;
  }

  const text = svg.startsWith("<?xml") ? svg : `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n${svg}`;
  await vscode.workspace.fs.writeFile(target, Buffer.from(text, "utf8"));
  vscode.window.showInformationMessage(`Exported SVG to ${target.fsPath}`);
}

async function savePng(pngDataUrl: string | undefined): Promise<void> {
  if (!pngDataUrl || pngDataUrl.trim().length === 0) {
    vscode.window.showWarningMessage("No PNG data available to export.");
    return;
  }

  const match = /^data:image\/png;base64,(.+)$/.exec(pngDataUrl);
  if (!match) {
    vscode.window.showWarningMessage("Invalid PNG payload.");
    return;
  }

  const target = await vscode.window.showSaveDialog({
    title: "Export Tree as PNG",
    filters: {
      "PNG files": ["png"],
    },
    saveLabel: "Export PNG",
  });

  if (!target) {
    return;
  }

  await vscode.workspace.fs.writeFile(target, Buffer.from(match[1], "base64"));
  vscode.window.showInformationMessage(`Exported PNG to ${target.fsPath}`);
}

function publishTree(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
  const source = document.getText();
  const parseStartedAt = Date.now();

  try {
    const parsed = parseTreeText(source, document.uri.fsPath);
    const parseMs = Date.now() - parseStartedAt;
    const viewer = viewersByDocument.get(document.uri.toString());
    if (viewer) {
      viewer.sourceFormat = parsed.format;
    }
    panel.webview.postMessage({
      type: "tree",
      payload: {
        root: parsed.root,
        format: parsed.format,
        parseMs,
        sourceLength: source.length,
      },
    });
  } catch (err) {
    panel.webview.postMessage({
      type: "parseError",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function getWebviewHtml(context: vscode.ExtensionContext, webview: vscode.Webview, fileBaseName: string): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, "media", "viewer.js")));
  const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, "media", "viewer.css")));
  const nonce = createNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>PhyloLens</title>
</head>
<body>
  <div class="header">
    <div class="header-row header-row-top">
      <div class="section section-titlemeta">
        <div class="title-left">
          <span class="title-main">PhyloLens</span>
          <span class="title-sep" aria-hidden="true"></span>
          <span class="title-file">${fileBaseName}</span>
          <span class="title-sep" aria-hidden="true"></span>
          <span id="sourceFormatState" class="badge" title="Detected source format for this viewer. Save As preserves topology, labels, and lengths; format-specific metadata may be normalized.">Source: unknown</span>
        </div>
        <div class="title-spacer"></div>
        <div class="title-right">
          <button id="uiModeToggleBtn" class="action-btn" type="button" title="Toggle between full toolbar and compact menu view.">Menu View</button>
          <div class="meta-badges">
            <span id="dirtyIndicator" class="dirty-indicator" title="Unsaved tree edits are present in the viewer." aria-label="Unsaved edits indicator"></span>
            <span id="fileState" class="badge" title="Compares current viewer tree state to the file originally opened in this viewer. Save As is tracked separately.">Edit sync: unknown</span>
          </div>
        </div>
      </div>
    </div>
    <div class="controls-panel">
    <div class="header-row header-row-movable" data-row-id="row-1">
      <div class="section section-file" data-section-id="file">
        <span class="section-label" title="File operations for tree formats and image exports. Drag this header to reorder rows.">File</span>
        <span class="subsection-label">Tree</span>
        <label class="control" for="saveFormatSelect">
          <select id="saveFormatSelect" title="Save current tree edits to a new tree file in the selected format.">
            <option value="" selected>Save As...</option>
            <option value="newick">Newick</option>
            <option value="nexus">NEXUS</option>
            <option value="phyloxml">PhyloXML</option>
            <option value="nexml">NeXML</option>
          </select>
        </label>
        <span class="subsection-label subsection-divider">Image</span>
        <button id="exportSvgBtn" class="action-btn" type="button" title="Export the current viewer rendering as SVG.">Export SVG</button>
        <button id="exportPngBtn" class="action-btn" type="button" title="Export the current viewer rendering as PNG.">Export PNG</button>
      </div>
    </div>
    <div class="header-row header-row-movable" data-row-id="row-2">
      <div class="section section-edit" data-section-id="edit">
        <span class="section-label" title="Edits tree structure/state. These changes affect Save As and exports. Drag this header to reorder rows.">Edit</span>
        <button id="swapNodeBtn" class="action-btn" type="button" title="Reverse child order at the selected internal node.">Swap Selected Node</button>
        <button id="rerootBtn" class="action-btn" type="button" title="Root the tree on the currently selected branch.">Root On Selected Branch</button>
        <button id="midpointRootBtn" class="action-btn" type="button" title="Midpoint: root at the halfway point of the longest tip-to-tip path.">Midpoint Root</button>
        <button id="leastSquaresRootBtn" class="action-btn" type="button" title="Least-squares: root where root-to-tip distances are as equal as possible.">Least-Squares Root</button>
        <button id="unrootBtn" class="action-btn" type="button" title="Convert the current rooted tree to an unrooted structure.">Unroot</button>
        <button id="undoBtn" class="action-btn" type="button" title="Undo the most recent tree edit action.">Undo</button>
        <button id="revertBtn" class="action-btn" type="button" title="Restore viewer tree state to the original loaded file.">Revert</button>
      </div>
    </div>
    <div class="header-row header-row-movable" data-row-id="row-3">
      <div class="section section-view" data-section-id="view">
        <span class="section-label" title="Changes tree display/state in the viewer. These changes are not written to saved Newick, but they are reflected in image exports. Drag this header to reorder rows.">View</span>
        <label class="control" for="layoutSelect">
          <span class="subsection-label">Layout</span>
          <select id="layoutSelect" title="Choose the tree layout and branch-depth mode.">
            <option value="phylogram" selected>Rectangular (lengths)</option>
            <option value="cladogram">Rectangular (equal)</option>
            <option value="radial_lengths_curved">Radial (lengths, curved)</option>
            <option value="radial_lengths_straight">Radial (lengths, straight)</option>
            <option value="radial_equal_curved">Radial (equal, curved)</option>
            <option value="radial_equal_straight">Radial (equal, straight)</option>
          </select>
        </label>
        <span class="subsection-label">Zoom</span>
        <button id="zoomOutBtn" class="action-btn" type="button" title="Zoom out from the current center.">-</button>
        <button id="zoomInBtn" class="action-btn" type="button" title="Zoom in toward the current center.">+</button>
        <button id="fitBtn" class="action-btn" type="button" title="Center and fit the tree in the viewport while keeping overlays visible.">Fit</button>
        <span class="subsection-label">Tree</span>
        <button id="toggleCollapseBtn" class="action-btn" type="button" title="Collapse/expand selected clade in the viewer. Affects image export; not written to saved Newick.">Collapse/Expand Selected</button>
        <span class="subsection-label">UI</span>
        <button id="resetToolbarLayoutBtn" class="action-btn" type="button" title="Reset draggable toolbar rows to their default order.">Reset Toolbar</button>
      </div>
    </div>
    <div class="header-row header-row-movable" data-row-id="row-4">
      <div class="section section-options" data-section-id="options">
        <span class="section-label" title="Display toggles for labels, scale bar, hover details, and highlighting. These affect image export rendering but are not written to saved Newick. Drag this header to reorder rows.">Options</span>
        <label class="control check" for="highlightPolySelect" title="Highlight non-bifurcating internal nodes">
          <input id="highlightPolySelect" type="checkbox" />
          Show polytomies
        </label>
        <label class="control check" for="showLengthsSelect" title="Show branch length labels on edges">
          <input id="showLengthsSelect" type="checkbox" />
          Show branch lengths
        </label>
        <label class="control check" for="showBranchHoverDetailsSelect" title="Show node/branch details on hover">
          <input id="showBranchHoverDetailsSelect" type="checkbox" checked />
          Hover details
        </label>
        <label class="control check" for="showScaleBarSelect" title="Show the graphical scale bar overlay">
          <input id="showScaleBarSelect" type="checkbox" checked />
          Show scale bar
        </label>
        <label class="control check" for="showNodeShapesSelect" title="Show circular node shapes">
          <input id="showNodeShapesSelect" type="checkbox" checked />
          Show node shapes
        </label>
        <label class="control check" for="showTipLabelsSelect" title="Show labels for terminal taxa (tips)">
          <input id="showTipLabelsSelect" type="checkbox" checked />
          Show tip labels
        </label>
        <label class="control check" for="showInternalLabelsSelect" title="Show labels for internal nodes">
          <input id="showInternalLabelsSelect" type="checkbox" />
          Show node labels
        </label>
      </div>
    </div>
    <div class="header-row header-row-bottom header-row-movable" data-row-id="row-5">
      <div class="section section-search" data-section-id="search">
        <span class="section-label" title="Find matching tip/internal node labels and jump between matches. Drag this header to reorder rows.">Search</span>
        <label class="control" for="taxaSearchInput">
          <span class="subsection-label">Taxa</span>
          <input id="taxaSearchInput" class="text-input" type="text" placeholder="Type name" title="Search node labels. Enter advances to next match." />
        </label>
        <button id="clearSearchBtn" class="action-btn" type="button" title="Clear the current search and selection focus.">Clear</button>
        <button id="searchPrevBtn" class="action-btn" type="button" title="Jump to previous search match.">Prev</button>
        <button id="searchNextBtn" class="action-btn" type="button" title="Jump to next search match.">Next</button>
        <span id="searchCounter" class="search-counter" title="Current match / total matches">0/0</span>
      </div>
    </div>
    </div>
    <div id="compactMenuBar" class="compact-menu-bar" aria-label="Compact menu bar">
      <div class="compact-menus">
        <div class="menu-root" data-menu-id="file">
          <button class="menu-trigger" type="button">File</button>
          <div class="menu-dropdown">
            <div class="menu-group-label">Tree</div>
            <div class="menu-item has-submenu">Save As ▸
              <div class="menu-submenu">
                <button class="menu-item menu-save-format-option" type="button" data-save-format="newick">Newick</button>
                <button class="menu-item menu-save-format-option" type="button" data-save-format="nexus">NEXUS</button>
                <button class="menu-item menu-save-format-option" type="button" data-save-format="phyloxml">PhyloXML</button>
                <button class="menu-item menu-save-format-option" type="button" data-save-format="nexml">NeXML</button>
              </div>
            </div>
            <div class="menu-sep"></div>
            <div class="menu-group-label">Image</div>
            <button id="menuExportSvgBtn" class="menu-item" type="button">Export SVG</button>
            <button id="menuExportPngBtn" class="menu-item" type="button">Export PNG</button>
          </div>
        </div>
        <div class="menu-root" data-menu-id="edit">
          <button class="menu-trigger" type="button">Edit</button>
          <div class="menu-dropdown">
            <button id="menuSwapNodeBtn" class="menu-item" type="button">Swap Selected Node</button>
            <button id="menuRerootBtn" class="menu-item" type="button">Root On Selected Branch</button>
            <button id="menuMidpointRootBtn" class="menu-item" type="button">Midpoint Root</button>
            <button id="menuLeastSquaresRootBtn" class="menu-item" type="button">Least-Squares Root</button>
            <button id="menuUnrootBtn" class="menu-item" type="button">Unroot</button>
            <div class="menu-sep"></div>
            <button id="menuUndoBtn" class="menu-item" type="button">Undo</button>
            <button id="menuRevertBtn" class="menu-item" type="button">Revert</button>
          </div>
        </div>
        <div class="menu-root" data-menu-id="view">
          <button class="menu-trigger" type="button">View</button>
          <div class="menu-dropdown">
            <div class="menu-group-label">Layout</div>
            <div class="menu-item has-submenu">Layout ▸
              <div class="menu-submenu">
                <button class="menu-item menu-layout-option" type="button" data-layout="phylogram">Rectangular (lengths)</button>
                <button class="menu-item menu-layout-option" type="button" data-layout="cladogram">Rectangular (equal)</button>
                <button class="menu-item menu-layout-option" type="button" data-layout="radial_lengths_curved">Radial (lengths, curved)</button>
                <button class="menu-item menu-layout-option" type="button" data-layout="radial_lengths_straight">Radial (lengths, straight)</button>
                <button class="menu-item menu-layout-option" type="button" data-layout="radial_equal_curved">Radial (equal, curved)</button>
                <button class="menu-item menu-layout-option" type="button" data-layout="radial_equal_straight">Radial (equal, straight)</button>
              </div>
            </div>
            <div class="menu-sep"></div>
            <div class="menu-group-label">Zoom</div>
            <button id="menuZoomOutBtn" class="menu-item" type="button">Zoom Out</button>
            <button id="menuZoomInBtn" class="menu-item" type="button">Zoom In</button>
            <button id="menuFitBtn" class="menu-item" type="button">Fit</button>
            <div class="menu-sep"></div>
            <div class="menu-group-label">Tree</div>
            <button id="menuToggleCollapseBtn" class="menu-item" type="button">Collapse/Expand Selected</button>
          </div>
        </div>
        <div class="menu-root" data-menu-id="options">
          <button class="menu-trigger" type="button">Options</button>
          <div class="menu-dropdown">
            <button class="menu-item menu-check-option" type="button" data-option-id="highlightPolySelect">Show polytomies</button>
            <button class="menu-item menu-check-option" type="button" data-option-id="showLengthsSelect">Show branch lengths</button>
            <button class="menu-item menu-check-option" type="button" data-option-id="showBranchHoverDetailsSelect">Hover details</button>
            <button class="menu-item menu-check-option" type="button" data-option-id="showScaleBarSelect">Show scale bar</button>
            <button class="menu-item menu-check-option" type="button" data-option-id="showNodeShapesSelect">Show node shapes</button>
            <button class="menu-item menu-check-option" type="button" data-option-id="showTipLabelsSelect">Show tip labels</button>
            <button class="menu-item menu-check-option" type="button" data-option-id="showInternalLabelsSelect">Show node labels</button>
          </div>
        </div>
      </div>
      <div class="compact-search">
        <input id="compactTaxaSearchInput" class="text-input" type="text" placeholder="Search taxa" title="Search node labels. Enter advances to next match." />
        <button id="compactClearSearchBtn" class="action-btn" type="button" title="Clear search and focused selection.">Clear</button>
        <button id="compactSearchPrevBtn" class="action-btn" type="button" title="Previous match.">Prev</button>
        <button id="compactSearchNextBtn" class="action-btn" type="button" title="Next match.">Next</button>
        <span id="compactSearchCounter" class="search-counter" title="Current match / total matches">0/0</span>
      </div>
    </div>
  </div>
  <div id="canvasWrap" class="canvas-wrap"></div>
  <div class="status-strip">
    <div class="status-left">
      <span id="rootState" class="badge" title="Rooted means the tree has a designated root direction (ancestor to descendant), i.e., an implied direction of evolution. Unrooted means no explicit root direction.">Rooted: unknown</span>
      <span id="branchState" class="badge" title="Bifurcating means each split has two descendants. In unrooted display mode, the single 3-way display root is expected and is not treated as a polytomy.">Bifurcating: unknown</span>
      <span id="ultrametricState" class="badge" title="Ultrametric means all tips are the same distance from the root (equal root-to-tip path length). Note that being ultrametric does not necessarily mean this is a time tree.">Ultrametric: unknown</span>
      <span id="scaleState" class="badge" title="Scale value shown by the scale bar in branch-length units (or 1 in equal-depth layouts).">Scale: n/a</span>
      <span id="selectionInfo" class="selection-info">Selection: none</span>
    </div>
    <div class="status-right">
      <span id="perfState" class="badge" title="Parsing/rendering performance status for the current tree.">Perf: n/a</span>
      <span id="viewState" class="view-state">Current view: n/a</span>
    </div>
  </div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 24; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
