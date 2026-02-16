import {
  cloneTree as deepClone,
  countTips,
  expandAllCollapsed,
  findNodeById,
  leastSquaresRootTree,
  midpointRootTree,
  rerootTree,
  structuralChildren,
  unrootTree,
} from "./generated/tree-ops.js";
import { countTreeNodes, formatLength, isBifurcating, isUltrametric } from "./tree-metrics.js";

const vscode = acquireVsCodeApi();
const wrapEl = document.getElementById("canvasWrap");
const layoutSelectEl = document.getElementById("layoutSelect");
const highlightPolySelectEl = document.getElementById("highlightPolySelect");
const showLengthsSelectEl = document.getElementById("showLengthsSelect");
const showBranchHoverDetailsSelectEl = document.getElementById("showBranchHoverDetailsSelect");
const showScaleBarSelectEl = document.getElementById("showScaleBarSelect");
const showNodeShapesSelectEl = document.getElementById("showNodeShapesSelect");
const showTipLabelsSelectEl = document.getElementById("showTipLabelsSelect");
const showInternalLabelsSelectEl = document.getElementById("showInternalLabelsSelect");
const taxaSearchInputEl = document.getElementById("taxaSearchInput");
const searchPrevBtnEl = document.getElementById("searchPrevBtn");
const searchNextBtnEl = document.getElementById("searchNextBtn");
const searchCounterEl = document.getElementById("searchCounter");
const toggleCollapseBtnEl = document.getElementById("toggleCollapseBtn");
const swapNodeBtnEl = document.getElementById("swapNodeBtn");
const rerootBtnEl = document.getElementById("rerootBtn");
const midpointRootBtnEl = document.getElementById("midpointRootBtn");
const leastSquaresRootBtnEl = document.getElementById("leastSquaresRootBtn");
const unrootBtnEl = document.getElementById("unrootBtn");
const undoBtnEl = document.getElementById("undoBtn");
const revertBtnEl = document.getElementById("revertBtn");
const zoomOutBtnEl = document.getElementById("zoomOutBtn");
const zoomInBtnEl = document.getElementById("zoomInBtn");
const fitBtnEl = document.getElementById("fitBtn");
const resetViewBtnEl = document.getElementById("resetViewBtn");
const resetToolbarLayoutBtnEl = document.getElementById("resetToolbarLayoutBtn");
const saveAsBtnEl = document.getElementById("saveAsBtn");
const exportSvgBtnEl = document.getElementById("exportSvgBtn");
const exportPngBtnEl = document.getElementById("exportPngBtn");
const selectionInfoEl = document.getElementById("selectionInfo");
const viewStateEl = document.getElementById("viewState");
const dirtyIndicatorEl = document.getElementById("dirtyIndicator");
const sourceFormatStateEl = document.getElementById("sourceFormatState");
const fileStateEl = document.getElementById("fileState");
const rootStateEl = document.getElementById("rootState");
const branchStateEl = document.getElementById("branchState");
const ultrametricStateEl = document.getElementById("ultrametricState");
const scaleStateEl = document.getElementById("scaleState");
const perfStateEl = document.getElementById("perfState");
const headerEl = document.querySelector(".header");

const VALID_LAYOUTS = new Set([
  "phylogram",
  "cladogram",
  "radial_lengths_curved",
  "radial_lengths_straight",
  "radial_equal_curved",
  "radial_equal_straight",
]);

let latestRender = null;
let sourceTree = null;
let workingTree = null;
let currentLayout = "phylogram";
let selectedNodeId = null;
let selectedEdgeKey = null;
let selectedEdgeTargetNodeId = null;
let highlightPolytomies = false;
let showBranchLengths = false;
let showBranchHoverDetails = true;
let showScaleBar = true;
let showNodeShapes = true;
let showTipLabels = true;
let showInternalLabels = false;
let taxaSearchTerm = "";
let taxaSearchMatches = [];
let taxaSearchIndex = -1;
let rootedExplicit = null;
let undoStack = [];
let viewTransform = { tx: 0, ty: 0, scale: 1 };
let hasUserViewport = false;
let draggingToolbarSection = null;
let lastSavedAsPath = null;
let lastSavedAsTreeSnapshot = null;
let sourceFormat = "unknown";
let lastParseMs = null;
let lastRenderMs = null;
let lastTreeNodeCount = 0;
let lastTipCount = 0;
let didSendLargeTreeWarning = false;
const hoverInfoEl = createHoverInfoElement();

const LARGE_TREE_TIP_THRESHOLD = 3000;
const LARGE_TREE_NODE_THRESHOLD = 6000;
const VERY_LARGE_TREE_NODE_THRESHOLD = 12000;

if (layoutSelectEl) {
  layoutSelectEl.addEventListener("change", () => {
    const next = layoutSelectEl.value;
    if (!VALID_LAYOUTS.has(next)) {
      return;
    }

    currentLayout = next;
    if (workingTree) {
      renderTree(workingTree);
      updateStatus();
    }
  });
}

if (highlightPolySelectEl) {
  highlightPolySelectEl.addEventListener("change", () => {
    highlightPolytomies = Boolean(highlightPolySelectEl.checked);
    if (workingTree) {
      renderTree(workingTree);
      updateStatus();
    }
  });
}

if (showLengthsSelectEl) {
  showLengthsSelectEl.addEventListener("change", () => {
    showBranchLengths = Boolean(showLengthsSelectEl.checked);
    if (workingTree) {
      renderTree(workingTree);
      updateStatus();
    }
  });
}

if (showBranchHoverDetailsSelectEl) {
  showBranchHoverDetailsSelectEl.addEventListener("change", () => {
    showBranchHoverDetails = Boolean(showBranchHoverDetailsSelectEl.checked);
    if (!showBranchHoverDetails) {
      hideHoverInfo();
    }
  });
}

if (showScaleBarSelectEl) {
  showScaleBarSelectEl.addEventListener("change", () => {
    showScaleBar = Boolean(showScaleBarSelectEl.checked);
    if (workingTree) {
      renderTree(workingTree);
      updateStatus();
    }
  });
}

if (showNodeShapesSelectEl) {
  showNodeShapesSelectEl.addEventListener("change", () => {
    showNodeShapes = Boolean(showNodeShapesSelectEl.checked);
    applyNodeShapeVisibility();
    if (workingTree) {
      renderTree(workingTree);
      updateStatus();
    }
  });
}

if (showTipLabelsSelectEl) {
  showTipLabelsSelectEl.addEventListener("change", () => {
    showTipLabels = Boolean(showTipLabelsSelectEl.checked);
    if (workingTree) {
      renderTree(workingTree);
      updateStatus();
    }
  });
}

if (showInternalLabelsSelectEl) {
  showInternalLabelsSelectEl.addEventListener("change", () => {
    showInternalLabels = Boolean(showInternalLabelsSelectEl.checked);
    if (workingTree) {
      renderTree(workingTree);
      updateStatus();
    }
  });
}

if (taxaSearchInputEl) {
  taxaSearchInputEl.addEventListener("input", () => {
    taxaSearchTerm = String(taxaSearchInputEl.value || "").trim();
    refreshTaxaSearchMatches();
    if (workingTree) {
      renderTree(workingTree);
      updateStatus();
    }
  });

  taxaSearchInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      jumpToNextTaxaMatch();
    }
  });
}

if (searchNextBtnEl) {
  searchNextBtnEl.addEventListener("click", () => {
    jumpToNextTaxaMatch();
  });
}

if (searchPrevBtnEl) {
  searchPrevBtnEl.addEventListener("click", () => {
    jumpToPrevTaxaMatch();
  });
}

if (toggleCollapseBtnEl) {
  toggleCollapseBtnEl.addEventListener("click", () => {
    if (!workingTree || !selectedNodeId) {
      return;
    }

    const treeForEdit = deepClone(workingTree);
    const target = findNodeById(treeForEdit, selectedNodeId);
    if (!target) {
      return;
    }

    const visibleChildren = Array.isArray(target.children) ? target.children : [];
    const collapsedChildren = Array.isArray(target._collapsedChildren) ? target._collapsedChildren : [];
    if (visibleChildren.length === 0 && collapsedChildren.length === 0) {
      return;
    }

    pushUndoState();

    if (collapsedChildren.length > 0) {
      target.children = collapsedChildren;
      delete target._collapsedChildren;
    } else {
      target._collapsedChildren = visibleChildren;
      target.children = [];
    }

    workingTree = treeForEdit;
    selectedEdgeKey = null;
    selectedEdgeTargetNodeId = null;
    refreshTaxaSearchMatches();
    renderTree(workingTree);
    updateStatus();
  });
}

if (swapNodeBtnEl) {
  swapNodeBtnEl.addEventListener("click", () => {
    if (!workingTree || !selectedNodeId) {
      return;
    }

    const treeForEdit = deepClone(workingTree);
    const target = findNodeById(treeForEdit, selectedNodeId);
    if (!target) {
      return;
    }

    const visibleChildren = Array.isArray(target.children) ? target.children : [];
    const collapsedChildren = Array.isArray(target._collapsedChildren) ? target._collapsedChildren : [];
    if (visibleChildren.length >= 2) {
      pushUndoState();
      target.children = visibleChildren.slice().reverse();
    } else if (collapsedChildren.length >= 2) {
      pushUndoState();
      target._collapsedChildren = collapsedChildren.slice().reverse();
    } else {
      return;
    }

    workingTree = treeForEdit;
    refreshTaxaSearchMatches();
    renderTree(workingTree);
    updateStatus();
  });
}

if (rerootBtnEl) {
  rerootBtnEl.addEventListener("click", () => {
    const targetId = selectedEdgeTargetNodeId;
    if (!workingTree || !targetId) {
      return;
    }

    const treeForEdit = deepClone(workingTree);
    expandAllCollapsed(treeForEdit);
    const rerooted = rerootTree(treeForEdit, targetId);
    if (!rerooted) {
      return;
    }

    pushUndoState();
    workingTree = rerooted;
    rootedExplicit = true;
    refreshTaxaSearchMatches();
    renderTree(workingTree);
    updateStatus();
  });
}

if (midpointRootBtnEl) {
  midpointRootBtnEl.addEventListener("click", () => {
    if (!workingTree) {
      return;
    }

    const treeForEdit = deepClone(workingTree);
    expandAllCollapsed(treeForEdit);
    const rerooted = midpointRootTree(treeForEdit);
    if (!rerooted) {
      return;
    }

    pushUndoState();
    workingTree = rerooted;
    rootedExplicit = true;
    refreshTaxaSearchMatches();
    renderTree(workingTree);
    updateStatus();
  });
}

if (leastSquaresRootBtnEl) {
  leastSquaresRootBtnEl.addEventListener("click", () => {
    if (!workingTree) {
      return;
    }

    const treeForEdit = deepClone(workingTree);
    expandAllCollapsed(treeForEdit);
    const rerooted = leastSquaresRootTree(treeForEdit);
    if (!rerooted) {
      return;
    }

    pushUndoState();
    workingTree = rerooted;
    rootedExplicit = true;
    refreshTaxaSearchMatches();
    renderTree(workingTree);
    updateStatus();
  });
}

if (unrootBtnEl) {
  unrootBtnEl.addEventListener("click", () => {
    if (!workingTree) {
      return;
    }

    const treeForEdit = deepClone(workingTree);
    expandAllCollapsed(treeForEdit);

    pushUndoState();
    workingTree = unrootTree(treeForEdit);
    rootedExplicit = false;
    refreshTaxaSearchMatches();
    renderTree(workingTree);
    updateStatus();
  });
}

if (undoBtnEl) {
  undoBtnEl.addEventListener("click", () => {
    if (undoStack.length === 0) {
      return;
    }
    const previous = undoStack.pop();
    restoreState(previous);
  });
}

if (revertBtnEl) {
  revertBtnEl.addEventListener("click", () => {
    if (!sourceTree || !workingTree) {
      return;
    }
    pushUndoState();
    workingTree = deepClone(sourceTree);
    rootedExplicit = inferRooted(workingTree);
    selectedNodeId = null;
    selectedEdgeKey = null;
    selectedEdgeTargetNodeId = null;
    refreshTaxaSearchMatches();
    renderTree(workingTree);
    updateStatus();
  });
}

if (zoomInBtnEl) {
  zoomInBtnEl.addEventListener("click", () => {
    zoomAtViewportCenter(1.2);
  });
}

if (zoomOutBtnEl) {
  zoomOutBtnEl.addEventListener("click", () => {
    zoomAtViewportCenter(1 / 1.2);
  });
}

if (fitBtnEl) {
  fitBtnEl.addEventListener("click", () => {
    fitToView();
  });
}

if (resetViewBtnEl) {
  resetViewBtnEl.addEventListener("click", () => {
    resetView();
  });
}

if (resetToolbarLayoutBtnEl) {
  resetToolbarLayoutBtnEl.addEventListener("click", () => {
    resetToolbarLayout();
  });
}

if (saveAsBtnEl) {
  saveAsBtnEl.addEventListener("click", () => {
    if (!workingTree) {
      return;
    }
    const treeToSave = deepClone(workingTree);
    expandAllCollapsed(treeToSave);
    vscode.postMessage({ type: "saveTreeAs", tree: treeToSave });
  });
}

if (exportSvgBtnEl) {
  exportSvgBtnEl.addEventListener("click", () => {
    const svg = currentSvgMarkup();
    if (!svg) {
      return;
    }
    vscode.postMessage({ type: "exportSvg", svg });
  });
}

if (exportPngBtnEl) {
  exportPngBtnEl.addEventListener("click", async () => {
    const pngDataUrl = await currentPngDataUrl();
    if (!pngDataUrl) {
      return;
    }
    vscode.postMessage({ type: "exportPng", pngDataUrl });
  });
}

initializeToolbarDragDrop();

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg) {
    return;
  }

  if (msg.type === "parseError") {
    sourceTree = null;
    workingTree = null;
    latestRender = null;
    selectedNodeId = null;
    selectedEdgeKey = null;
    selectedEdgeTargetNodeId = null;
    rootedExplicit = null;
    undoStack = [];
    taxaSearchMatches = [];
    taxaSearchIndex = -1;
    lastSavedAsPath = null;
    lastSavedAsTreeSnapshot = null;
    sourceFormat = "unknown";
    lastParseMs = null;
    lastRenderMs = null;
    lastTreeNodeCount = 0;
    lastTipCount = 0;
    didSendLargeTreeWarning = false;
    hasUserViewport = false;
    viewTransform = { tx: 0, ty: 0, scale: 1 };
    hideHoverInfo();
    renderError(msg.error || "Unknown parse error");
    if (scaleStateEl) {
      scaleStateEl.textContent = "Scale: n/a";
    }
    if (viewStateEl) {
      viewStateEl.textContent = "Current view: n/a";
    }
    updateBadges();
    updateActionState();
    return;
  }

  if (msg.type === "tree") {
    sourceTree = deepClone(msg.payload.root);
    workingTree = deepClone(msg.payload.root);
    sourceFormat = normalizeSourceFormat(msg.payload.format);
    lastParseMs = Number.isFinite(msg.payload.parseMs) ? Number(msg.payload.parseMs) : null;
    selectedNodeId = null;
    selectedEdgeKey = null;
    selectedEdgeTargetNodeId = null;
    rootedExplicit = inferRooted(workingTree);
    undoStack = [];
    lastSavedAsPath = null;
    lastSavedAsTreeSnapshot = null;
    lastTreeNodeCount = countTreeNodes(workingTree, structuralChildren);
    lastTipCount = countTips(workingTree);
    didSendLargeTreeWarning = false;
    applyLargeTreeGuardrails();
    refreshTaxaSearchMatches();
    hasUserViewport = false;
    viewTransform = { tx: 0, ty: 0, scale: 1 };
    hideHoverInfo();
    renderTree(workingTree);
    updateStatus();
    return;
  }

  if (msg.type === "saveTreeAsResult") {
    if (msg.savedPath && workingTree) {
      lastSavedAsPath = String(msg.savedPath);
      lastSavedAsTreeSnapshot = deepClone(workingTree);
      updateBadges();
    }
    return;
  }

  if (msg.type === "cursorOffset" && latestRender) {
    highlightNodeForOffset(msg.offset);
  }
});

function initializeToolbarDragDrop() {
  if (!headerEl) {
    return;
  }

  const rows = getMovableHeaderRows();
  if (rows.length === 0) {
    return;
  }

  for (const row of rows) {
    row.addEventListener("dragover", onToolbarRowDragOver);
    row.addEventListener("drop", onToolbarRowDrop);
    row.addEventListener("dragleave", onToolbarRowDragLeave);
  }

  const sections = getMovableSections();
  for (const section of sections) {
    section.classList.add("is-draggable");

    const handle = section.querySelector(".section-label");
    if (handle instanceof HTMLElement) {
      handle.setAttribute("draggable", "true");
      handle.addEventListener("dragstart", onToolbarSectionDragStart);
      handle.addEventListener("dragend", onToolbarSectionDragEnd);
    }
  }

  restoreToolbarLayout();
  updateToolbarRowDecorations();
}

function onToolbarSectionDragStart(event) {
  const handle = event.currentTarget;
  if (!handle || !(handle instanceof HTMLElement)) {
    return;
  }

  const section = handle.closest(".section[data-section-id]");
  if (!section || !(section instanceof HTMLElement)) {
    return;
  }

  draggingToolbarSection = section;
  section.classList.add("is-dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(section.dataset.sectionId || ""));
  }
}

function onToolbarSectionDragEnd() {
  if (draggingToolbarSection) {
    draggingToolbarSection.classList.remove("is-dragging");
  }
  draggingToolbarSection = null;
  clearToolbarDropIndicators();
}

function onToolbarRowDragOver(event) {
  if (!draggingToolbarSection) {
    return;
  }
  event.preventDefault();
  const row = event.currentTarget;
  if (row instanceof HTMLElement) {
    row.classList.add("is-drop-target");
  }
}

function onToolbarRowDrop(event) {
  if (!draggingToolbarSection) {
    return;
  }
  event.preventDefault();
  const row = event.currentTarget;
  if (!(row instanceof HTMLElement) || !row.classList.contains("header-row-movable")) {
    return;
  }

  moveSectionToRowWithShift(draggingToolbarSection, row);
  persistToolbarLayout();
  updateToolbarRowDecorations();
  clearToolbarDropIndicators();
}

function onToolbarRowDragLeave(event) {
  const row = event.currentTarget;
  if (!(row instanceof HTMLElement)) {
    return;
  }
  if (row.contains(event.relatedTarget)) {
    return;
  }
  row.classList.remove("is-drop-target");
}

function onToolbarSectionDragOver(event) {
  if (!draggingToolbarSection) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const section = event.currentTarget;
  if (!(section instanceof HTMLElement) || section === draggingToolbarSection) {
    return;
  }
  const row = section.parentElement;
  if (row instanceof HTMLElement) {
    row.classList.add("is-drop-target");
  }
}

function onToolbarSectionDrop(event) {
  if (!draggingToolbarSection) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const section = event.currentTarget;
  if (!(section instanceof HTMLElement) || section === draggingToolbarSection) {
    return;
  }
  const row = section.parentElement;
  if (!(row instanceof HTMLElement)) {
    return;
  }
  moveSectionToRowWithShift(draggingToolbarSection, row);
  persistToolbarLayout();
  updateToolbarRowDecorations();
  clearToolbarDropIndicators();
}

function onToolbarSectionDragLeave(event) {
  const section = event.currentTarget;
  if (!(section instanceof HTMLElement)) {
    return;
  }
  const row = section.parentElement;
  if (row instanceof HTMLElement && row.contains(event.relatedTarget)) {
    return;
  }
  if (row instanceof HTMLElement) {
    row.classList.remove("is-drop-target");
  }
}

function clearToolbarDropIndicators() {
  for (const row of getMovableHeaderRows()) {
    row.classList.remove("is-drop-target");
  }
}

function getMovableHeaderRows() {
  return Array.from(document.querySelectorAll(".header-row-movable"));
}

function getMovableSections() {
  return Array.from(document.querySelectorAll(".section[data-section-id]"));
}

function restoreToolbarLayout() {
  const state = vscode.getState();
  const layout = state && state.toolbarLayout;
  if (!layout || !Array.isArray(layout.rows)) {
    return;
  }

  const byId = new Map();
  for (const section of getMovableSections()) {
    const id = section.dataset.sectionId;
    if (id) {
      byId.set(id, section);
    }
  }

  const rows = getMovableHeaderRows();
  const orderedIds = [];
  for (let i = 0; i < rows.length; i += 1) {
    const ids = Array.isArray(layout.rows[i]) ? layout.rows[i] : [];
    for (const id of ids) {
      if (typeof id === "string" && id.length > 0) {
        orderedIds.push(id);
      }
    }
  }
  const seen = new Set();
  let rowIndex = 0;
  for (const id of orderedIds) {
    const section = byId.get(id);
    if (!section || seen.has(id) || rowIndex >= rows.length) {
      continue;
    }
    rows[rowIndex].appendChild(section);
    seen.add(id);
    rowIndex += 1;
  }

  for (const [id, section] of byId.entries()) {
    if (!seen.has(id)) {
      if (rowIndex < rows.length) {
        rows[rowIndex].appendChild(section);
        rowIndex += 1;
      } else {
        rows[rows.length - 1]?.appendChild(section);
      }
    }
  }
  updateToolbarRowDecorations();
}

function persistToolbarLayout() {
  const rows = getMovableHeaderRows();
  const data = {
    rows: rows.map((row) => {
      const section = row.querySelector(".section[data-section-id]");
      const id = section ? section.dataset.sectionId : null;
      return typeof id === "string" && id.length > 0 ? [id] : [];
    }),
  };
  const prior = vscode.getState() || {};
  vscode.setState({ ...prior, toolbarLayout: data });
}

function resetToolbarLayout() {
  const rows = getMovableHeaderRows();
  if (rows.length < 5) {
    return;
  }

  const byId = new Map();
  for (const section of getMovableSections()) {
    const id = section.dataset.sectionId;
    if (id) {
      byId.set(id, section);
    }
  }

  const row1 = rows.find((r) => r.dataset.rowId === "row-1") || rows[0];
  const row2 = rows.find((r) => r.dataset.rowId === "row-2") || rows[1];
  const row3 = rows.find((r) => r.dataset.rowId === "row-3") || rows[2];
  const row4 = rows.find((r) => r.dataset.rowId === "row-4") || rows[3];
  const row5 = rows.find((r) => r.dataset.rowId === "row-5") || rows[4];

  const defaults = [
    [row1, ["file"]],
    [row2, ["edit"]],
    [row3, ["view"]],
    [row4, ["options"]],
    [row5, ["search"]],
  ];

  for (const [row, ids] of defaults) {
    for (const id of ids) {
      const section = byId.get(id);
      if (section) {
        row.appendChild(section);
      }
    }
  }

  persistToolbarLayout();
  updateToolbarRowDecorations();
}

function moveSectionToRowWithShift(section, targetRow) {
  if (!section || !targetRow) {
    return;
  }
  const sourceRow = section.parentElement;
  if (!(sourceRow instanceof HTMLElement) || sourceRow === targetRow) {
    return;
  }

  const rows = getMovableHeaderRows();
  const targetIndex = rows.indexOf(targetRow);
  if (targetIndex < 0) {
    return;
  }

  const orderedSections = [];
  for (const row of rows) {
    const current = row.querySelector(".section[data-section-id]");
    if (current instanceof HTMLElement) {
      orderedSections.push(current);
    }
  }
  const fromIndex = orderedSections.indexOf(section);
  if (fromIndex < 0) {
    return;
  }
  orderedSections.splice(fromIndex, 1);
  orderedSections.splice(targetIndex, 0, section);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const current = orderedSections[i];
    if (current) {
      row.appendChild(current);
    }
  }
}

function updateToolbarRowDecorations() {
  const rows = getMovableHeaderRows();
  let seenSection = false;
  for (const row of rows) {
    const sections = Array.from(row.querySelectorAll(".section[data-section-id]"));
    for (const section of sections) {
      section.classList.remove("section-divider");
      if (seenSection) {
        section.classList.add("section-divider");
      }
      seenSection = true;
    }
  }
}

function renderTree(root) {
  const startedAt = performance.now();
  if (currentLayout === "phylogram") {
    renderRectangular(root, false);
  } else if (currentLayout === "cladogram") {
    renderRectangular(root, true);
  } else if (currentLayout === "radial_lengths_curved") {
    renderPolar(root, "lengths", "curved");
  } else if (currentLayout === "radial_lengths_straight") {
    renderPolar(root, "lengths", "straight");
  } else if (currentLayout === "radial_equal_curved") {
    renderPolar(root, "equal", "curved");
  } else {
    renderPolar(root, "equal", "straight");
  }
  lastRenderMs = performance.now() - startedAt;
  applyNodeShapeVisibility();
  updateBadges();
  updateActionState();
}

function applyNodeShapeVisibility() {
  if (!wrapEl) {
    return;
  }
  // We hide glyphs via CSS, but keep an enlarged transparent hit area on node circles
  // so selection/edit actions remain usable without visible node markers.
  wrapEl.classList.toggle("node-shapes-hidden", !showNodeShapes);
}

function renderRectangular(root, equalDepth) {
  const nodes = [];
  const edges = [];
  let maxDepth = 0;
  let leafCount = 0;

  walk(root, 0, true);

  const margin = { top: 20, right: 180, bottom: 42, left: 30 };
  const width = Math.max(720, maxDepth * 90 + margin.left + margin.right);
  const height = Math.max(240, leafCount * 28 + margin.top + margin.bottom);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = (value) => margin.left + (maxDepth === 0 ? 0 : (value / maxDepth) * innerWidth);
  const yScale = (value) => margin.top + (leafCount <= 1 ? innerHeight / 2 : (value / (leafCount - 1)) * innerHeight);

  for (const node of nodes) {
    node.sx = xScale(node.depth);
    node.sy = yScale(node.y);
  }

  let geometry = "";
  let labels = "";

  for (const edge of edges) {
    const selectedClass = edge.key === selectedEdgeKey ? " is-selected" : "";
    const p = `M ${edge.parent.sx} ${edge.parent.sy} V ${edge.child.sy} H ${edge.child.sx}`;
    geometry += `<path class="edge${selectedClass}" data-edge-key="${edge.key}" d="${p}" />`;
    geometry += `<path class="edge-hit" data-edge-key="${edge.key}" data-child-id="${edge.child.id}" data-start="${edge.child.start}" data-end="${edge.child.end}" data-length="${Number.isFinite(edge.length) ? edge.length : ""}" data-tip-count="${edge.child.tipCount}" d="${p}" />`;
    if (showBranchLengths && (equalDepth || Number.isFinite(edge.length))) {
      const lx = (edge.parent.sx + edge.child.sx) / 2;
      const ly = edge.child.sy - 8;
      const shownLength = equalDepth ? 1 : edge.length;
      labels += `<text class="branch-length" x="${lx}" y="${ly}" text-anchor="middle">${formatLength(shownLength)}</text>`;
    }
  }

  const scaleOverlay = showScaleBar
    ? renderScaleBarSvg({
        x: margin.left + 10,
        y: height - 10,
        pxPerUnit: maxDepth > 0 ? innerWidth / maxDepth : 0,
        mode: equalDepth ? "equal" : "lengths",
        maxDepth,
        maxPx: width - (margin.left + 10) - 14,
      })
    : "";

  const polyIds = highlightPolytomies ? new Set(findNonBifurcatingNodeIds(root)) : new Set();
  const matchedNodeIds = new Set(taxaSearchMatches);
  const hideRootMarker = rootedExplicit === false;

  for (const node of nodes) {
    if (!(hideRootMarker && node.id === root.id)) {
      const polyClass = polyIds.has(node.id) ? " is-polytomy" : "";
      const matchClass = matchedNodeIds.has(node.id) ? " is-search-hit" : "";
      const collapsedClass = Array.isArray(node._collapsedChildren) && node._collapsedChildren.length > 0 ? " is-collapsed" : "";
      geometry += `<circle class="node-circle${polyClass}${matchClass}${collapsedClass}" data-id="${node.id}" data-name="${escapeXml(node.name || "")}" data-length="${Number.isFinite(node.length) ? node.length : ""}" data-tip-count="${node.tipCount}" data-is-tip="${node.children.length === 0 ? "1" : "0"}" data-start="${node.start}" data-end="${node.end}" cx="${node.sx}" cy="${node.sy}" r="4"></circle>`;
    }
    const isSearchFocus = matchedNodeIds.has(node.id) && node.id === selectedNodeId && taxaSearchTerm.length > 0;
    if ((showTipLabels || isSearchFocus) && node.name && node.children.length === 0) {
      const focusClass = isSearchFocus && !showTipLabels ? " search-focus-label" : "";
      labels += `<text class="label${focusClass}" x="${node.sx + 8}" y="${node.sy}">${escapeXml(node.name)}</text>`;
    }
    if ((showInternalLabels || isSearchFocus) && node.name && node.children.length > 0) {
      const focusClass = isSearchFocus && !showInternalLabels ? " search-focus-label" : "";
      labels += `<text class="label${focusClass}" x="${node.sx + 8}" y="${node.sy}">${escapeXml(node.name)}</text>`;
    }
  }

  const svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"><g id="viewport"><g id="tree-content"><g id="tree-geometry">${geometry}</g><g id="tree-labels">${labels}</g></g><g id="overlay">${scaleOverlay}</g></g></svg>`;
  wrapEl.innerHTML = svg;
  bindInteractions();
  initializeZoom(width, height);
  updateScaleIndicator(equalDepth ? "equal" : "lengths", maxDepth);

  function walk(node, depth, isRoot) {
    const branchLength = Number.isFinite(node.length) ? Math.max(0, node.length) : 1;
    const increment = isRoot ? 0 : equalDepth ? 1 : branchLength;
    const thisDepth = depth + increment;

    maxDepth = Math.max(maxDepth, thisDepth);

    const sourceChildren = node.children || [];
    const viewNode = {
      ...node,
      depth: thisDepth,
      y: 0,
      tipCount: 0,
      children: [],
    };

    nodes.push(viewNode);

    if (sourceChildren.length === 0) {
      viewNode.y = leafCount;
      leafCount += 1;
      viewNode.tipCount = 1;
      return viewNode;
    }

    for (const sourceChild of sourceChildren) {
      const childView = walk(sourceChild, thisDepth, false);
      viewNode.children.push(childView);
      edges.push({
        parent: viewNode,
        child: childView,
        key: `${viewNode.id}->${childView.id}`,
        length: childView.length,
      });
    }

    const avgY = viewNode.children.reduce((sum, child) => sum + child.y, 0) / viewNode.children.length;
    viewNode.y = avgY;
    viewNode.tipCount = viewNode.children.reduce((sum, child) => sum + (Number.isFinite(child.tipCount) ? child.tipCount : 0), 0);

    return viewNode;
  }
}

function renderPolar(root, depthMode, edgeMode) {
  const nodes = [];
  const edges = [];
  let maxDepth = 0;
  let leafCount = 0;

  const rootView = walkDepth(root, 0, true);
  assignAngles(rootView);

  const canvasSize = Math.max(460, leafCount * 28);
  const width = canvasSize;
  const height = canvasSize;
  const cx = width / 2;
  const cy = height / 2;
  const labelPad = 70;
  const radiusMax = Math.max(50, Math.min(width, height) / 2 - labelPad);
  const safeMaxDepth = maxDepth > 0 ? maxDepth : 1;

  for (const node of nodes) {
    const radius = (node.depth / safeMaxDepth) * radiusMax;
    node.radius = radius;
    node.sx = cx + radius * Math.cos(node.angle);
    node.sy = cy + radius * Math.sin(node.angle);
  }

  let geometry = "";
  let labels = "";

  for (const edge of edges) {
    const selectedClass = edge.key === selectedEdgeKey ? " is-selected" : "";
    let p;
    if (edgeMode === "curved") {
      p = radialPhylogramEdgePath(cx, cy, edge.parent, edge.child);
    } else {
      p = `M ${edge.parent.sx} ${edge.parent.sy} L ${edge.child.sx} ${edge.child.sy}`;
    }
    geometry += `<path class="edge${selectedClass}" data-edge-key="${edge.key}" d="${p}" />`;
    geometry += `<path class="edge-hit" data-edge-key="${edge.key}" data-child-id="${edge.child.id}" data-start="${edge.child.start}" data-end="${edge.child.end}" data-length="${Number.isFinite(edge.length) ? edge.length : ""}" data-tip-count="${edge.child.tipCount}" d="${p}" />`;
    if (showBranchLengths && (depthMode === "equal" || Number.isFinite(edge.length))) {
      const labelPoint = polarLabelPoint(edgeMode, cx, cy, edge.parent, edge.child);
      const shownLength = depthMode === "equal" ? 1 : edge.length;
      labels += `<text class="branch-length" x="${labelPoint.x}" y="${labelPoint.y}" text-anchor="middle">${formatLength(shownLength)}</text>`;
    }
  }

  const scaleOverlay = showScaleBar
    ? renderScaleBarSvg({
        x: 16,
        y: height - 10,
        pxPerUnit: safeMaxDepth > 0 ? radiusMax / safeMaxDepth : 0,
        mode: depthMode,
        maxDepth,
        maxPx: width - 16 - 14,
      })
    : "";

  const polyIds = highlightPolytomies ? new Set(findNonBifurcatingNodeIds(root)) : new Set();
  const matchedNodeIds = new Set(taxaSearchMatches);
  const hideRootMarker = rootedExplicit === false;

  for (const node of nodes) {
    if (!(hideRootMarker && node.id === root.id)) {
      const polyClass = polyIds.has(node.id) ? " is-polytomy" : "";
      const matchClass = matchedNodeIds.has(node.id) ? " is-search-hit" : "";
      const collapsedClass = Array.isArray(node._collapsedChildren) && node._collapsedChildren.length > 0 ? " is-collapsed" : "";
      geometry += `<circle class="node-circle${polyClass}${matchClass}${collapsedClass}" data-id="${node.id}" data-name="${escapeXml(node.name || "")}" data-length="${Number.isFinite(node.length) ? node.length : ""}" data-tip-count="${node.tipCount}" data-is-tip="${node.children.length === 0 ? "1" : "0"}" data-start="${node.start}" data-end="${node.end}" cx="${node.sx}" cy="${node.sy}" r="4"></circle>`;
    }
    const isSearchFocus = matchedNodeIds.has(node.id) && node.id === selectedNodeId && taxaSearchTerm.length > 0;
    if ((showTipLabels || isSearchFocus) && node.name && node.children.length === 0) {
      const offset = Math.cos(node.angle) >= 0 ? 8 : -8;
      const anchor = Math.cos(node.angle) >= 0 ? "start" : "end";
      const focusClass = isSearchFocus && !showTipLabels ? " search-focus-label" : "";
      labels += `<text class="label${focusClass}" text-anchor="${anchor}" x="${node.sx + offset}" y="${node.sy}">${escapeXml(node.name)}</text>`;
    }
    if ((showInternalLabels || isSearchFocus) && node.name && node.children.length > 0) {
      const focusClass = isSearchFocus && !showInternalLabels ? " search-focus-label" : "";
      const placement = polarInternalLabelPlacement(node);
      const lx = node.sx + Math.cos(placement.angle) * placement.offset;
      const ly = node.sy + Math.sin(placement.angle) * placement.offset;
      const anchor = polarTextAnchor(placement.angle);
      labels += `<text class="label${focusClass}" text-anchor="${anchor}" x="${lx}" y="${ly}">${escapeXml(node.name)}</text>`;
    }
  }

  const svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"><g id="viewport"><g id="tree-content"><g id="tree-geometry">${geometry}</g><g id="tree-labels">${labels}</g></g><g id="overlay">${scaleOverlay}</g></g></svg>`;
  wrapEl.innerHTML = svg;
  bindInteractions();
  initializeZoom(width, height);
  updateScaleIndicator(depthMode, maxDepth);

  function walkDepth(node, depth, isRoot) {
    const branchLength = Number.isFinite(node.length) ? Math.max(0, node.length) : 1;
    const increment = isRoot ? 0 : depthMode === "equal" ? 1 : branchLength;
    const thisDepth = depth + increment;

    maxDepth = Math.max(maxDepth, thisDepth);

    const sourceChildren = node.children || [];
    const viewNode = {
      ...node,
      depth: thisDepth,
      angle: 0,
      radius: 0,
      leafOrder: -1,
      tipCount: 0,
      children: [],
    };

    nodes.push(viewNode);

    if (sourceChildren.length === 0) {
      viewNode.leafOrder = leafCount;
      leafCount += 1;
      viewNode.tipCount = 1;
      return viewNode;
    }

    for (const sourceChild of sourceChildren) {
      const childView = walkDepth(sourceChild, thisDepth, false);
      childView.parent = viewNode;
      viewNode.children.push(childView);
      edges.push({
        parent: viewNode,
        child: childView,
        key: `${viewNode.id}->${childView.id}`,
        length: childView.length,
      });
    }

    viewNode.tipCount = viewNode.children.reduce((sum, child) => sum + (Number.isFinite(child.tipCount) ? child.tipCount : 0), 0);

    return viewNode;
  }

  function assignAngles(node) {
    if (node.children.length === 0) {
      node.angle = angleForLeaf(node.leafOrder, leafCount);
      return node.angle;
    }

    let sum = 0;
    for (const child of node.children) {
      sum += assignAngles(child);
    }

    node.angle = sum / node.children.length;
    return node.angle;
  }
}

function bindInteractions() {
  const svgEl = wrapEl.querySelector("svg");
  const viewportEl = wrapEl.querySelector("#viewport");
  const contentEl = wrapEl.querySelector("#tree-content");
  const circles = Array.from(wrapEl.querySelectorAll(".node-circle"));
  const edgeVisuals = Array.from(wrapEl.querySelectorAll(".edge"));
  const edgeHits = Array.from(wrapEl.querySelectorAll(".edge-hit"));

  circles.forEach((circle) => {
    circle.addEventListener("mouseenter", (event) => {
      showHoverForNode(circle, event.clientX, event.clientY);
    });

    circle.addEventListener("mousemove", (event) => {
      showHoverForNode(circle, event.clientX, event.clientY);
    });

    circle.addEventListener("mouseleave", () => {
      hideHoverInfo();
    });

    circle.addEventListener("click", () => {
      const start = Number(circle.getAttribute("data-start"));
      const end = Number(circle.getAttribute("data-end"));
      const id = String(circle.getAttribute("data-id") || "");

      if (id.length > 0) {
        selectedNodeId = id;
      }
      selectedEdgeKey = null;
      selectedEdgeTargetNodeId = null;

      if (Number.isFinite(start) && Number.isFinite(end)) {
        vscode.postMessage({ type: "revealRange", start, end });
      }

      setHighlightedNode(circle);
      clearEdgeHighlights(edgeVisuals);
      updateActionState();
    });
  });

  edgeHits.forEach((edgeEl) => {
    edgeEl.addEventListener("mouseenter", (event) => {
      showHoverForEdge(edgeEl, event.clientX, event.clientY);
    });

    edgeEl.addEventListener("mousemove", (event) => {
      showHoverForEdge(edgeEl, event.clientX, event.clientY);
    });

    edgeEl.addEventListener("mouseleave", () => {
      hideHoverInfo();
    });

    edgeEl.addEventListener("click", () => {
      const start = Number(edgeEl.getAttribute("data-start"));
      const end = Number(edgeEl.getAttribute("data-end"));
      selectedEdgeKey = String(edgeEl.getAttribute("data-edge-key") || "");
      selectedEdgeTargetNodeId = String(edgeEl.getAttribute("data-child-id") || "");
      selectedNodeId = null;

      if (Number.isFinite(start) && Number.isFinite(end)) {
        vscode.postMessage({ type: "revealRange", start, end });
      }

      clearNodeHighlights(circles);
      setSelectedEdge(selectedEdgeKey, edgeVisuals);
      updateActionState();
    });
  });

  svgEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target && target.closest && target.closest(".node-circle, .edge-hit")) {
      return;
    }

    selectedNodeId = null;
    selectedEdgeKey = null;
    selectedEdgeTargetNodeId = null;
    clearNodeHighlights(circles);
    clearEdgeHighlights(edgeVisuals);
    hideHoverInfo();
    updateActionState();
  });

  latestRender = { circles, edgeVisuals, edgeHits, svgEl, viewportEl, contentEl };

  if (selectedNodeId) {
    const selected = circles.find((circle) => circle.getAttribute("data-id") === selectedNodeId);
    if (selected) {
      setHighlightedNode(selected);
    }
  }

  if (selectedEdgeKey) {
    setSelectedEdge(selectedEdgeKey, edgeVisuals);
  }
}

function highlightNodeForOffset(offset) {
  let best = null;
  for (const circle of latestRender.circles) {
    const start = Number(circle.getAttribute("data-start"));
    const end = Number(circle.getAttribute("data-end"));
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      continue;
    }

    if (offset < start || offset > end) {
      continue;
    }

    const span = end - start;
    if (!best || span < best.span) {
      best = { circle, span };
    }
  }

  if (best) {
    selectedNodeId = String(best.circle.getAttribute("data-id") || "");
    selectedEdgeKey = null;
    selectedEdgeTargetNodeId = null;
    setHighlightedNode(best.circle);
    clearEdgeHighlights(latestRender.edgeVisuals || []);
    updateActionState();
  }
}

function setHighlightedNode(circle) {
  if (!latestRender) {
    return;
  }

  for (const candidate of latestRender.circles) {
    candidate.classList.toggle("is-highlighted", candidate === circle);
  }
}

function clearNodeHighlights(circles) {
  for (const circle of circles) {
    circle.classList.remove("is-highlighted");
  }
}

function setSelectedEdge(edgeKey, allEdges) {
  for (const edge of allEdges) {
    edge.classList.toggle("is-selected", edge.getAttribute("data-edge-key") === edgeKey);
  }
}

function clearEdgeHighlights(edges) {
  for (const edge of edges) {
    edge.classList.remove("is-selected");
  }
}

function initializeZoom(width, height) {
  if (!latestRender || !latestRender.svgEl || !latestRender.viewportEl || !latestRender.contentEl) {
    return;
  }

  const svgEl = latestRender.svgEl;
  const contentEl = latestRender.contentEl;
  const viewportEl = latestRender.viewportEl;

  if (!hasUserViewport) {
    const fitted = computeFitTransform(contentEl, width, height, 18);
    if (fitted) {
      viewTransform = fitted;
    } else {
      viewTransform = { tx: 0, ty: 0, scale: 1 };
    }
  }

  applyViewTransform(viewportEl, viewTransform);

  let isPanning = false;
  let panStart = null;

  svgEl.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAtClientPoint(factor, event.clientX, event.clientY);
    },
    { passive: false }
  );

  svgEl.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (target && target.closest && target.closest(".node-circle, .edge-hit")) {
      return;
    }

    const svgPoint = clientToSvgPoint(svgEl, event.clientX, event.clientY);
    if (!svgPoint) {
      return;
    }

    isPanning = true;
    panStart = {
      x: svgPoint.x,
      y: svgPoint.y,
      tx: viewTransform.tx,
      ty: viewTransform.ty,
    };
    svgEl.style.cursor = "grabbing";
  });

  svgEl.addEventListener("mousemove", (event) => {
    if (!isPanning || !panStart) {
      return;
    }

    const svgPoint = clientToSvgPoint(svgEl, event.clientX, event.clientY);
    if (!svgPoint) {
      return;
    }

    viewTransform.tx = panStart.tx + (svgPoint.x - panStart.x);
    viewTransform.ty = panStart.ty + (svgPoint.y - panStart.y);
    applyViewTransform(viewportEl, viewTransform);
  });

  const stopPan = () => {
    if (!isPanning) {
      return;
    }
    isPanning = false;
    panStart = null;
    hasUserViewport = true;
    svgEl.style.cursor = "";
    updateStatus();
  };

  svgEl.addEventListener("mouseup", stopPan);
  svgEl.addEventListener("mouseleave", stopPan);
}

function applyViewTransform(viewportEl, transform) {
  const s = clampScale(transform.scale);
  viewportEl.setAttribute("transform", `translate(${transform.tx} ${transform.ty}) scale(${s})`);
}

function clampScale(value) {
  return Math.max(0.05, Math.min(24, value));
}

function clientToSvgPoint(svgEl, clientX, clientY) {
  const ctm = svgEl.getScreenCTM();
  if (!ctm) {
    return null;
  }

  const point = svgEl.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(ctm.inverse());
}

function zoomAtClientPoint(factor, clientX, clientY) {
  if (!latestRender || !latestRender.svgEl || !latestRender.viewportEl) {
    return;
  }

  const svgPoint = clientToSvgPoint(latestRender.svgEl, clientX, clientY);
  if (!svgPoint) {
    return;
  }

  const oldScale = viewTransform.scale;
  const newScale = clampScale(oldScale * factor);
  if (newScale === oldScale) {
    return;
  }

  const contentX = (svgPoint.x - viewTransform.tx) / oldScale;
  const contentY = (svgPoint.y - viewTransform.ty) / oldScale;

  viewTransform.scale = newScale;
  viewTransform.tx = svgPoint.x - contentX * newScale;
  viewTransform.ty = svgPoint.y - contentY * newScale;

  applyViewTransform(latestRender.viewportEl, viewTransform);
  hasUserViewport = true;
  updateStatus();
}

function zoomAtViewportCenter(factor) {
  if (!latestRender || !latestRender.svgEl) {
    return;
  }
  const rect = latestRender.svgEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  zoomAtClientPoint(factor, cx, cy);
}

function fitToView() {
  if (!latestRender || !latestRender.contentEl || !latestRender.viewportEl || !latestRender.svgEl) {
    return;
  }

  const { width, height } = getSvgViewportSize(latestRender.svgEl);
  const fitted = computeFitTransform(latestRender.contentEl, width, height, 18);
  if (!fitted) {
    return;
  }

  viewTransform = fitted;
  applyViewTransform(latestRender.viewportEl, viewTransform);
  hasUserViewport = true;
  updateStatus();
}

function resetView() {
  if (!latestRender || !latestRender.viewportEl) {
    return;
  }
  viewTransform = { tx: 0, ty: 0, scale: 1 };
  applyViewTransform(latestRender.viewportEl, viewTransform);
  hasUserViewport = true;
  updateStatus();
}

function getSvgViewportSize(svgEl) {
  const viewBox = svgEl.viewBox && svgEl.viewBox.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }
  return { width: svgEl.clientWidth || 1, height: svgEl.clientHeight || 1 };
}

function computeFitTransform(contentEl, width, height, padding) {
  const bbox = contentEl.getBBox();
  if (!Number.isFinite(bbox.width) || !Number.isFinite(bbox.height) || bbox.width <= 0 || bbox.height <= 0) {
    return null;
  }

  const availW = Math.max(1, width - padding * 2);
  const availH = Math.max(1, height - padding * 2);
  const scale = clampScale(Math.min(availW / bbox.width, availH / bbox.height));

  const tx = (width - bbox.width * scale) / 2 - bbox.x * scale;
  const ty = (height - bbox.height * scale) / 2 - bbox.y * scale;

  return { tx, ty, scale };
}

function updateScaleIndicator(mode, maxDepth) {
  if (!scaleStateEl) {
    return;
  }

  if (mode === "equal") {
    scaleStateEl.textContent = "Scale: 1";
    return;
  }

  if (!Number.isFinite(maxDepth) || maxDepth <= 0) {
    scaleStateEl.textContent = "Scale: n/a";
    return;
  }

  const barUnits = chooseScaleBarUnits(maxDepth);
  scaleStateEl.textContent = `Scale: ${formatLength(barUnits)}`;
}

function renderScaleBarSvg(config) {
  const { x, y, pxPerUnit, mode, maxDepth, maxPx } = config;

  if (!Number.isFinite(pxPerUnit) || pxPerUnit <= 0) {
    return "";
  }

  let units = 1;
  let label = "1";

  if (mode !== "equal") {
    if (!Number.isFinite(maxDepth) || maxDepth <= 0) {
      return "";
    }
    units = chooseScaleBarUnits(maxDepth);
    label = formatLength(units);
  }

  let barPx = units * pxPerUnit;
  if (!Number.isFinite(barPx) || barPx <= 0) {
    return "";
  }

  const minPx = 36;
  const capPx = Number.isFinite(maxPx) && maxPx > 0 ? maxPx : barPx;
  if (barPx > capPx) {
    barPx = capPx;
  }
  if (barPx < minPx) {
    barPx = minPx;
  }

  // Keep numeric label honest if the bar had to be clamped.
  const displayUnits = pxPerUnit > 0 ? barPx / pxPerUnit : units;
  label = formatLength(displayUnits);

  const x2 = x + barPx;
  const midX = x + barPx / 2;
  return [
    `<line class="scale-bar" x1="${x}" y1="${y}" x2="${x2}" y2="${y}" />`,
    `<line class="scale-bar" x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" />`,
    `<line class="scale-bar" x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}" />`,
    `<text class="scale-label" text-anchor="middle" x="${midX}" y="${y - 14}">${escapeXml(label)}</text>`,
  ].join("");
}

function chooseScaleBarUnits(maxDepth) {
  if (!Number.isFinite(maxDepth) || maxDepth <= 0) {
    return 1;
  }

  const target = maxDepth / 5;
  const power = Math.pow(10, Math.floor(Math.log10(target)));
  const normalized = target / power;
  let step = 1;
  if (normalized <= 1) {
    step = 1;
  } else if (normalized <= 2) {
    step = 2;
  } else if (normalized <= 5) {
    step = 5;
  } else {
    step = 10;
  }
  return step * power;
}

function polarLabelPoint(edgeMode, cx, cy, parent, child) {
  // Keep branch-length labels near the edge with a local normal offset so
  // labels sit beside, not on top of, branches.
  const isCurved = edgeMode === "curved";
  let baseX = (parent.sx + child.sx) / 2;
  let baseY = (parent.sy + child.sy) / 2;
  let tanX = child.sx - parent.sx;
  let tanY = child.sy - parent.sy;

  if (isCurved) {
    // Branch length is represented on the radial leg; prefer labeling that segment.
    const radialLen = Math.max(0, child.radius - parent.radius);
    if (radialLen > 0.0001) {
      const midR = parent.radius + radialLen * 0.5;
      baseX = cx + midR * Math.cos(child.angle);
      baseY = cy + midR * Math.sin(child.angle);
      tanX = Math.cos(child.angle);
      tanY = Math.sin(child.angle);
    } else {
      // Fallback for effectively zero-length radial edges: use arc midpoint.
      const delta = normalizeAngleDelta(child.angle - parent.angle);
      const theta = parent.angle + delta * 0.5;
      baseX = cx + parent.radius * Math.cos(theta);
      baseY = cy + parent.radius * Math.sin(theta);
      const dir = delta >= 0 ? 1 : -1;
      tanX = -Math.sin(theta) * dir;
      tanY = Math.cos(theta) * dir;
    }
  }

  const tanLen = Math.hypot(tanX, tanY) || 1;
  let nx = -tanY / tanLen;
  let ny = tanX / tanLen;
  const rx = baseX - cx;
  const ry = baseY - cy;
  if (nx * rx + ny * ry < 0) {
    nx = -nx;
    ny = -ny;
  }

  const outward = isCurved ? 8 : 6;
  return {
    x: baseX + nx * outward,
    y: baseY + ny * outward,
  };
}

function polarTextAnchor(angle) {
  const c = Math.cos(angle);
  if (c > 0.35) {
    return "start";
  }
  if (c < -0.35) {
    return "end";
  }
  return "middle";
}

function polarInternalLabelPlacement(node) {
  const incident = [];
  if (node.parent) {
    incident.push(Math.atan2(node.parent.sy - node.sy, node.parent.sx - node.sx));
  }
  for (const child of node.children || []) {
    incident.push(Math.atan2(child.sy - node.sy, child.sx - node.sx));
  }

  if (incident.length === 0) {
    return { angle: node.angle || 0, offset: 12 };
  }

  let bestAngle = node.angle || 0;
  let bestScore = -1;
  for (let i = 0; i < 16; i += 1) {
    const candidate = -Math.PI + (Math.PI * 2 * i) / 16;
    let minGap = Infinity;
    for (const edgeAngle of incident) {
      const gap = Math.abs(normalizeAngleDelta(candidate - edgeAngle));
      if (gap < minGap) {
        minGap = gap;
      }
    }
    if (minGap > bestScore) {
      bestScore = minGap;
      bestAngle = candidate;
    }
  }

  return { angle: bestAngle, offset: 14 };
}

function renderError(text) {
  wrapEl.innerHTML = `<div class="error">${escapeXml(text)}</div>`;
}

function inferRooted(tree) {
  if (!tree) {
    return null;
  }
  return structuralChildren(tree).length === 2;
}

function findNonBifurcatingNodeIds(tree) {
  const out = [];
  if (!tree) {
    return out;
  }

  const stack = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    const children = structuralChildren(node);
    if (children.length > 0 && children.length !== 2) {
      out.push(node.id);
    }

    for (const child of children) {
      stack.push(child);
    }
  }

  return out;
}

function updateBadges() {
  if (!rootStateEl || !branchStateEl || !ultrametricStateEl || !fileStateEl || !dirtyIndicatorEl) {
    return;
  }

  if (sourceFormatStateEl) {
    sourceFormatStateEl.textContent = `Source: ${sourceFormatLabel(sourceFormat)}`;
    sourceFormatStateEl.className = "badge";
    sourceFormatStateEl.title =
      "Detected source format for this viewer. Save As preserves topology, labels, and branch lengths; format-specific metadata may be normalized.";
  }

  fileStateEl.title =
    "Compares current viewer tree state to the file originally opened in this viewer. Save As is tracked separately.";
  const synced = sourceTree && workingTree ? treesEquivalent(sourceTree, workingTree) : null;
  if (synced === true) {
    fileStateEl.textContent = "Unchanged from source file";
    fileStateEl.className = "badge sync-good";
    dirtyIndicatorEl.className = "dirty-indicator is-clean";
    dirtyIndicatorEl.style.visibility = "visible";
  } else if (synced === false) {
    const matchesSaved =
      lastSavedAsTreeSnapshot && workingTree ? treesEquivalent(lastSavedAsTreeSnapshot, workingTree) : false;
    if (matchesSaved && lastSavedAsPath) {
      fileStateEl.textContent = `Edited from source (saved as ${basenamePortable(lastSavedAsPath)})`;
      fileStateEl.className = "badge sync-saved";
      dirtyIndicatorEl.className = "dirty-indicator is-saved";
    } else {
      fileStateEl.textContent = "Edited from source file";
      fileStateEl.className = "badge sync-bad";
      dirtyIndicatorEl.className = "dirty-indicator is-dirty";
    }
    dirtyIndicatorEl.style.visibility = "visible";
  } else {
    fileStateEl.textContent = "Edit sync: unknown";
    fileStateEl.className = "badge";
    dirtyIndicatorEl.className = "dirty-indicator";
    dirtyIndicatorEl.style.visibility = "hidden";
  }

  rootStateEl.title =
    "Rooted means the tree has a designated root direction (ancestor to descendant), i.e., an implied direction of evolution. Unrooted means no explicit root direction.";
  const rooted = rootedExplicit;
  if (rooted === true) {
    rootStateEl.textContent = "Rooted";
    rootStateEl.className = "badge good";
  } else if (rooted === false) {
    rootStateEl.textContent = "Unrooted";
    rootStateEl.className = "badge";
  } else {
    rootStateEl.textContent = "Rooted: unknown";
    rootStateEl.className = "badge";
  }

  branchStateEl.title = "Bifurcating means each internal node splits into exactly two descendants; otherwise it is non-bifurcating (polytomy present).";
  const bif = isBifurcating(workingTree, structuralChildren);
  if (bif === true) {
    branchStateEl.textContent = "Bifurcating";
    branchStateEl.className = "badge good";
  } else if (bif === false) {
    branchStateEl.textContent = "Non-bifurcating";
    branchStateEl.className = "badge bad";
  } else {
    branchStateEl.textContent = "Bifurcation: unknown";
    branchStateEl.className = "badge";
  }

  ultrametricStateEl.title =
    "Ultrametric means all tips are the same distance from the root (equal root-to-tip path length). Note that being ultrametric does not necessarily mean this is a time tree.";
  const ultra = isUltrametric(workingTree, structuralChildren);
  if (ultra === true) {
    ultrametricStateEl.textContent = "Ultrametric";
    ultrametricStateEl.className = "badge good";
  } else if (ultra === false) {
    ultrametricStateEl.textContent = "Not ultrametric";
    ultrametricStateEl.className = "badge bad";
  } else {
    ultrametricStateEl.textContent = "Ultrametric: unknown";
    ultrametricStateEl.className = "badge";
  }

  updatePerformanceBadge();
}

function updatePerformanceBadge() {
  if (!perfStateEl) {
    return;
  }
  if (!workingTree) {
    perfStateEl.textContent = "Perf: n/a";
    perfStateEl.className = "badge";
    perfStateEl.title = "Parsing/rendering performance status for the current tree.";
    return;
  }

  const parsePart = Number.isFinite(lastParseMs) ? `${Math.round(lastParseMs)}ms` : "n/a";
  const renderPart = Number.isFinite(lastRenderMs) ? `${Math.round(lastRenderMs)}ms` : "n/a";
  const nodePart = lastTreeNodeCount > 0 ? `${lastTreeNodeCount} nodes` : "n/a";
  const tipPart = lastTipCount > 0 ? `${lastTipCount} tips` : "n/a";
  perfStateEl.textContent = `Perf: p ${parsePart}, r ${renderPart}`;
  perfStateEl.title = `Parse ${parsePart}, render ${renderPart}, ${nodePart}, ${tipPart}.`;

  const isLarge = lastTipCount >= LARGE_TREE_TIP_THRESHOLD || lastTreeNodeCount >= LARGE_TREE_NODE_THRESHOLD;
  const isSlow = (Number.isFinite(lastParseMs) && lastParseMs > 250) || (Number.isFinite(lastRenderMs) && lastRenderMs > 250);
  if (isLarge || isSlow) {
    perfStateEl.className = "badge bad";
  } else {
    perfStateEl.className = "badge good";
  }
}

function applyLargeTreeGuardrails() {
  if (!workingTree) {
    return;
  }

  const isLarge = lastTipCount >= LARGE_TREE_TIP_THRESHOLD || lastTreeNodeCount >= LARGE_TREE_NODE_THRESHOLD;
  const isVeryLarge = lastTreeNodeCount >= VERY_LARGE_TREE_NODE_THRESHOLD;

  let changedViewOptions = false;
  // These toggles are the biggest renderer multipliers on very large trees.
  // Disable them automatically once per tree load to keep first paint responsive.
  if (isLarge && showBranchHoverDetails) {
    showBranchHoverDetails = false;
    if (showBranchHoverDetailsSelectEl) {
      showBranchHoverDetailsSelectEl.checked = false;
    }
    changedViewOptions = true;
  }
  if (isVeryLarge && showInternalLabels) {
    showInternalLabels = false;
    if (showInternalLabelsSelectEl) {
      showInternalLabelsSelectEl.checked = false;
    }
    changedViewOptions = true;
  }

  if (changedViewOptions && !didSendLargeTreeWarning) {
    didSendLargeTreeWarning = true;
    vscode.postMessage({
      type: "notify",
      level: "warning",
      text: "Large tree detected: hover details (and for very large trees, internal labels) were disabled to keep rendering responsive.",
    });
  }
}

function normalizeSourceFormat(value) {
  if (typeof value !== "string") {
    return "unknown";
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return "unknown";
  }
  return trimmed;
}

function sourceFormatLabel(value) {
  if (value === "newick") {
    return "Newick";
  }
  if (value === "nexus") {
    return "NEXUS";
  }
  if (value === "phyloxml") {
    return "PhyloXML";
  }
  if (value === "nexml") {
    return "NeXML";
  }
  return "Unknown";
}

function updateActionState() {
  if (rerootBtnEl) {
    rerootBtnEl.disabled = !workingTree || !selectedEdgeTargetNodeId;
  }
  if (midpointRootBtnEl) {
    midpointRootBtnEl.disabled = !workingTree;
  }
  if (leastSquaresRootBtnEl) {
    leastSquaresRootBtnEl.disabled = !workingTree;
  }
  if (unrootBtnEl) {
    unrootBtnEl.disabled = !workingTree || rootedExplicit === false;
  }
  if (undoBtnEl) {
    undoBtnEl.disabled = undoStack.length === 0;
  }
  if (revertBtnEl) {
    revertBtnEl.disabled = !workingTree || !sourceTree;
  }
  if (zoomInBtnEl) {
    zoomInBtnEl.disabled = !latestRender || !latestRender.svgEl;
  }
  if (zoomOutBtnEl) {
    zoomOutBtnEl.disabled = !latestRender || !latestRender.svgEl;
  }
  if (fitBtnEl) {
    fitBtnEl.disabled = !latestRender || !latestRender.svgEl;
  }
  if (resetViewBtnEl) {
    resetViewBtnEl.disabled = !latestRender || !latestRender.svgEl;
  }
  if (saveAsBtnEl) {
    saveAsBtnEl.disabled = !workingTree;
  }
  if (exportSvgBtnEl) {
    exportSvgBtnEl.disabled = !workingTree || !latestRender || !latestRender.svgEl;
  }
  if (exportPngBtnEl) {
    exportPngBtnEl.disabled = !workingTree || !latestRender || !latestRender.svgEl;
  }
  if (searchPrevBtnEl) {
    searchPrevBtnEl.disabled = taxaSearchMatches.length === 0;
  }
  if (searchNextBtnEl) {
    searchNextBtnEl.disabled = taxaSearchMatches.length === 0;
  }
  if (toggleCollapseBtnEl) {
    toggleCollapseBtnEl.disabled = !canToggleSelectedNodeCollapse();
  }
  if (swapNodeBtnEl) {
    swapNodeBtnEl.disabled = !canSwapSelectedNode();
  }
  updateSearchCounter();
  updateSelectionInfo();
}

function updateStatus() {
  if (!viewStateEl) {
    return;
  }
  const zoomPct = Math.round(clampScale(viewTransform.scale) * 100);
  viewStateEl.textContent = `Current view: ${layoutLabel(currentLayout)}, zoom ${zoomPct}%`;
}

function createHoverInfoElement() {
  const el = document.createElement("div");
  el.className = "hover-info";
  el.style.display = "none";
  document.body.appendChild(el);
  return el;
}

function showHoverForEdge(edgeEl, clientX, clientY) {
  if (!showBranchHoverDetails || !hoverInfoEl) {
    return;
  }

  const rawLength = edgeEl.getAttribute("data-length");
  const len = rawLength && rawLength.length > 0 ? formatLength(Number(rawLength)) : "n/a";
  const tipCount = Number(edgeEl.getAttribute("data-tip-count"));
  const tipText = Number.isFinite(tipCount) ? String(tipCount) : "n/a";
  hoverInfoEl.textContent = `Length: ${len} | Descendant tips: ${tipText}`;
  hoverInfoEl.style.display = "block";
  hoverInfoEl.style.left = `${clientX + 12}px`;
  hoverInfoEl.style.top = `${clientY + 12}px`;
}

function showHoverForNode(nodeEl, clientX, clientY) {
  if (!showBranchHoverDetails || !hoverInfoEl) {
    return;
  }

  const isTip = nodeEl.getAttribute("data-is-tip") === "1";
  const name = nodeEl.getAttribute("data-name") || "";
  const tipCount = Number(nodeEl.getAttribute("data-tip-count"));
  const tipText = Number.isFinite(tipCount) ? String(tipCount) : "n/a";
  const nodeType = isTip ? "Tip" : "Node";
  const nameText = name.length > 0 ? name : "[unlabeled]";
  hoverInfoEl.textContent = `${nodeType}: ${nameText} | Clade tips: ${tipText}`;
  hoverInfoEl.style.display = "block";
  hoverInfoEl.style.left = `${clientX + 12}px`;
  hoverInfoEl.style.top = `${clientY + 12}px`;
}

function hideHoverInfo() {
  if (!hoverInfoEl) {
    return;
  }
  hoverInfoEl.style.display = "none";
}

function refreshTaxaSearchMatches() {
  if (!workingTree) {
    taxaSearchMatches = [];
    taxaSearchIndex = -1;
    updateActionState();
    return;
  }

  const query = String(taxaSearchTerm || "").trim().toLowerCase();
  if (query.length === 0) {
    taxaSearchMatches = [];
    taxaSearchIndex = -1;
    updateActionState();
    return;
  }

  const matches = [];
  const stack = [workingTree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (node.name && String(node.name).toLowerCase().includes(query)) {
      matches.push(node.id);
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      stack.push(child);
    }
  }

  taxaSearchMatches = matches;
  if (matches.length === 0) {
    taxaSearchIndex = -1;
  } else if (taxaSearchIndex < 0 || taxaSearchIndex >= matches.length) {
    taxaSearchIndex = 0;
    selectedNodeId = matches[0];
  }

  updateActionState();
}

function jumpToNextTaxaMatch() {
  if (taxaSearchMatches.length === 0 || !workingTree) {
    return;
  }

  taxaSearchIndex = (taxaSearchIndex + 1) % taxaSearchMatches.length;
  selectedNodeId = taxaSearchMatches[taxaSearchIndex];
  selectedEdgeKey = null;
  selectedEdgeTargetNodeId = null;
  renderTree(workingTree);
  centerOnSelectedNode();
  updateStatus();
}

function jumpToPrevTaxaMatch() {
  if (taxaSearchMatches.length === 0 || !workingTree) {
    return;
  }

  taxaSearchIndex = (taxaSearchIndex - 1 + taxaSearchMatches.length) % taxaSearchMatches.length;
  selectedNodeId = taxaSearchMatches[taxaSearchIndex];
  selectedEdgeKey = null;
  selectedEdgeTargetNodeId = null;
  renderTree(workingTree);
  centerOnSelectedNode();
  updateStatus();
}

function updateSearchCounter() {
  if (!searchCounterEl) {
    return;
  }

  const total = taxaSearchMatches.length;
  if (total === 0) {
    searchCounterEl.textContent = "0/0";
    return;
  }

  if (selectedNodeId) {
    const selectedIndex = taxaSearchMatches.indexOf(selectedNodeId);
    if (selectedIndex >= 0) {
      taxaSearchIndex = selectedIndex;
    }
  }

  if (taxaSearchIndex < 0 || taxaSearchIndex >= total) {
    taxaSearchIndex = 0;
  }
  searchCounterEl.textContent = `${taxaSearchIndex + 1}/${total}`;
}

function updateSelectionInfo() {
  if (!selectionInfoEl) {
    return;
  }

  if (!workingTree) {
    selectionInfoEl.textContent = "Selection: none";
    return;
  }

  if (selectedEdgeTargetNodeId) {
    const child = findNodeById(workingTree, selectedEdgeTargetNodeId);
    if (!child) {
      selectionInfoEl.textContent = "Selection: none";
      return;
    }
    const edgeLen = Number.isFinite(child.length) ? formatLength(child.length) : "n/a";
    const tipCount = countTips(child);
    selectionInfoEl.textContent = `Selection: branch len ${edgeLen}, clade tips ${tipCount}`;
    return;
  }

  if (selectedNodeId) {
    const node = findNodeById(workingTree, selectedNodeId);
    if (!node) {
      selectionInfoEl.textContent = "Selection: none";
      return;
    }
    const tipCount = countTips(node);
    const label = node.name && node.name.length > 0 ? node.name : "[internal]";
    if ((node.children || []).length === 0) {
      selectionInfoEl.textContent = `Selection: tip ${label}`;
    } else {
      selectionInfoEl.textContent = `Selection: node ${label}, clade tips ${tipCount}`;
    }
    return;
  }

  selectionInfoEl.textContent = "Selection: none";
}

function centerOnSelectedNode() {
  if (!latestRender || !latestRender.svgEl || !latestRender.viewportEl || !selectedNodeId) {
    return;
  }

  const nodeEl = latestRender.circles.find((circle) => circle.getAttribute("data-id") === selectedNodeId);
  if (!nodeEl) {
    return;
  }

  const cx = Number(nodeEl.getAttribute("cx"));
  const cy = Number(nodeEl.getAttribute("cy"));
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    return;
  }

  const { width, height } = getSvgViewportSize(latestRender.svgEl);
  viewTransform.tx = width / 2 - cx * viewTransform.scale;
  viewTransform.ty = height / 2 - cy * viewTransform.scale;
  applyViewTransform(latestRender.viewportEl, viewTransform);
  hasUserViewport = true;
}

function canToggleSelectedNodeCollapse() {
  if (!workingTree || !selectedNodeId) {
    return false;
  }

  const node = findNodeById(workingTree, selectedNodeId);
  if (!node) {
    return false;
  }

  const visibleChildren = Array.isArray(node.children) ? node.children.length : 0;
  const collapsedChildren = Array.isArray(node._collapsedChildren) ? node._collapsedChildren.length : 0;
  return visibleChildren > 0 || collapsedChildren > 0;
}

function canSwapSelectedNode() {
  if (!workingTree || !selectedNodeId) {
    return false;
  }
  const node = findNodeById(workingTree, selectedNodeId);
  if (!node) {
    return false;
  }
  return structuralChildren(node).length >= 2;
}

function currentSvgMarkup() {
  if (!latestRender || !latestRender.svgEl) {
    return null;
  }

  const svgEl = latestRender.svgEl;
  const cloned = svgEl.cloneNode(true);
  const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    cloned.setAttribute("width", String(vb.width));
    cloned.setAttribute("height", String(vb.height));
    cloned.setAttribute("viewBox", `0 0 ${vb.width} ${vb.height}`);
    cloned.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }
  cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  cloned.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  cloned.querySelectorAll(".edge-hit").forEach((el) => el.remove());

  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleEl.textContent = `
    .edge { fill: none; stroke: #1f3340; stroke-width: 1.4; }
    .edge.is-selected { stroke: #177da6; stroke-width: 2.4; }
    .node-circle { fill: #ffffff; stroke: #1f3340; stroke-width: 1.2; }
    .node-circle.is-highlighted { stroke: #ff8c00; stroke-width: 2.5; }
    .node-circle.is-polytomy { stroke: #bc1a1a; stroke-width: 2.2; }
    .node-circle.is-search-hit { stroke: #177da6; stroke-width: 2.1; }
    .node-circle.is-collapsed { fill: #d8edf7; }
    .label { fill: #0f1e2a; font-size: 12px; dominant-baseline: middle; font-family: "IBM Plex Sans","Segoe UI",sans-serif; }
    .label.search-focus-label { fill: #177da6; font-weight: 600; }
    .branch-length { fill: #2a576f; font-size: 10px; dominant-baseline: middle; font-family: "IBM Plex Sans","Segoe UI",sans-serif; }
    .scale-bar { stroke: #345263; stroke-width: 1.4; fill: none; }
    .scale-label { fill: #345263; font-size: 9px; dominant-baseline: hanging; font-family: "IBM Plex Sans","Segoe UI",sans-serif; }
  `;
  cloned.insertBefore(styleEl, cloned.firstChild);
  return cloned.outerHTML;
}

async function currentPngDataUrl() {
  const svgMarkup = currentSvgMarkup();
  if (!svgMarkup || !latestRender || !latestRender.svgEl) {
    return null;
  }

  const svgEl = latestRender.svgEl;
  const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  const width = Math.max(1, Math.round((vb && vb.width) || svgEl.clientWidth || 1));
  const height = Math.max(1, Math.round((vb && vb.height) || svgEl.clientHeight || 1));

  const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function treesEquivalent(a, b) {
  if (!a || !b) {
    return false;
  }

  const na = normalizeTreeForCompare(a);
  const nb = normalizeTreeForCompare(b);
  return JSON.stringify(na) === JSON.stringify(nb);
}

function normalizeTreeForCompare(node) {
  return {
    id: node.id,
    name: node.name,
    length: node.length,
    children: (node.children || []).map((child) => normalizeTreeForCompare(child)),
  };
}

function pushUndoState() {
  if (!workingTree) {
    return;
  }

  undoStack.push({
    tree: deepClone(workingTree),
    rootedExplicit,
    selectedNodeId,
    selectedEdgeKey,
    selectedEdgeTargetNodeId,
  });

  if (undoStack.length > 100) {
    undoStack.shift();
  }
}

function restoreState(state) {
  if (!state || !state.tree) {
    return;
  }

  workingTree = deepClone(state.tree);
  rootedExplicit = state.rootedExplicit;
  selectedNodeId = state.selectedNodeId || null;
  selectedEdgeKey = state.selectedEdgeKey || null;
  selectedEdgeTargetNodeId = state.selectedEdgeTargetNodeId || null;
  refreshTaxaSearchMatches();
  renderTree(workingTree);
  updateStatus();
}

function angleForLeaf(order, totalLeaves) {
  if (totalLeaves <= 1) {
    return -Math.PI / 2;
  }

  const turns = order / totalLeaves;
  return -Math.PI / 2 + turns * Math.PI * 2;
}

function radialPhylogramEdgePath(cx, cy, parent, child) {
  const startX = parent.sx;
  const startY = parent.sy;
  const parentRadius = parent.radius;
  const childRadius = child.radius;
  const arcEnd = polarToCartesian(cx, cy, parentRadius, child.angle);

  let path = `M ${startX} ${startY}`;

  if (parentRadius > 0.0001) {
    const delta = normalizeAngleDelta(child.angle - parent.angle);
    const sweepFlag = delta >= 0 ? 1 : 0;
    const largeArcFlag = Math.abs(delta) > Math.PI ? 1 : 0;
    path += ` A ${parentRadius} ${parentRadius} 0 ${largeArcFlag} ${sweepFlag} ${arcEnd.x} ${arcEnd.y}`;
  } else {
    path += ` L ${arcEnd.x} ${arcEnd.y}`;
  }

  if (childRadius > parentRadius + 0.0001) {
    path += ` L ${child.sx} ${child.sy}`;
  }

  return path;
}

function normalizeAngleDelta(delta) {
  let out = delta;
  while (out <= -Math.PI) {
    out += Math.PI * 2;
  }
  while (out > Math.PI) {
    out -= Math.PI * 2;
  }
  return out;
}

function polarToCartesian(cx, cy, radius, angle) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function layoutLabel(layout) {
  if (layout === "cladogram") {
    return "rectangular/equal";
  }
  if (layout === "radial_lengths_curved") {
    return "radial/lengths/curved";
  }
  if (layout === "radial_lengths_straight") {
    return "radial/lengths/straight";
  }
  if (layout === "radial_equal_curved") {
    return "radial/equal/curved";
  }
  if (layout === "radial_equal_straight") {
    return "radial/equal/straight";
  }
  return "rectangular/lengths";
}

function basenamePortable(pathText) {
  const value = String(pathText || "");
  const unix = value.lastIndexOf("/");
  const win = value.lastIndexOf("\\");
  const idx = Math.max(unix, win);
  return idx >= 0 ? value.slice(idx + 1) : value;
}

function escapeXml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
