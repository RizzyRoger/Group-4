importScripts("group.js");

const DEFAULT_MODE = "ungrouped_only";
const COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

const ICON_SQUARE_COLORS = [
  "rgb(76, 141, 255)",
  "rgb(61, 220, 151)",
  "rgb(192, 132, 252)",
  "rgb(255, 176, 32)",
];

const MODES = {
  ungrouped_only: {
    title: "Only ungrouped tabs",
    tooltip: "Group Four: only ungrouped tabs",
  },
  regroup_all: {
    title: "Regroup all tabs",
    tooltip: "Group Four: regroup all tabs",
  },
  merge_smart: {
    title: "Keep and adjust groups",
    tooltip: "Group Four: keep and adjust groups",
  },
};

const SKIP_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "about:",
  "edge://",
  "devtools://",
];

let iconTimer = null;
let iconFrame = 0;
let iconRestoreTimer = null;
let busy = false;
let cachedMode = DEFAULT_MODE;
let modeReady = false;

const RESULT_HOLD_MS = 700;

const RESULT_BORDERS = {
  green: "rgb(22, 163, 74)",
  red: "rgb(192, 57, 43)",
  grey: "rgb(107, 114, 128)",
};

chrome.runtime.onInstalled.addListener(() => {
  setupMenus();
});

chrome.runtime.onStartup.addListener(() => {
  setupMenus();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (!MODES[info.menuItemId]) return;
  await setMode(info.menuItemId);
});

chrome.action.onClicked.addListener(async (tab) => {
  await groupCurrentWindow(tab.windowId);
});

async function setupMenus() {
  const { mode } = await chrome.storage.local.get("mode");
  cachedMode = MODES[mode] ? mode : DEFAULT_MODE;
  modeReady = true;
  await chrome.storage.local.set({ mode: cachedMode });
  await chrome.contextMenus.removeAll();
  await chrome.contextMenus.create({
    id: "grouping_mode",
    title: "Grouping mode",
    contexts: ["action"],
  });
  for (const [id, { title }] of Object.entries(MODES)) {
    await chrome.contextMenus.create({
      id,
      parentId: "grouping_mode",
      type: "radio",
      title,
      checked: id === cachedMode,
      contexts: ["action"],
    });
  }
  await updateTooltip(cachedMode);
}

async function setMode(mode) {
  cachedMode = MODES[mode] ? mode : DEFAULT_MODE;
  modeReady = true;
  await chrome.storage.local.set({ mode: cachedMode });
  await updateTooltip(cachedMode);
}

async function getMode() {
  if (modeReady && MODES[cachedMode]) return cachedMode;
  const { mode } = await chrome.storage.local.get("mode");
  cachedMode = MODES[mode] ? mode : DEFAULT_MODE;
  modeReady = true;
  return cachedMode;
}

async function updateTooltip(mode) {
  const meta = MODES[mode] || MODES[DEFAULT_MODE];
  await chrome.action.setTitle({ title: meta.tooltip });
}

async function groupCurrentWindow(windowId) {
  if (busy) return;
  busy = true;
  let result = "green";

  try {
    const activeMode = await getMode();
    startIconSpin();

    if (activeMode === "regroup_all") {
      await ungroupWindow(windowId);
    }

    if (activeMode === "merge_smart") {
      const snapshot = await collectMergeSnapshot(windowId);
      const movable = [
        ...snapshot.existing.flatMap((group) => group.tabs),
        ...snapshot.ungrouped,
      ];
      if (movable.length < 2) {
        result = "grey";
        return;
      }
      const existingIds = new Set(snapshot.existing.map((group) => group.keepId));
      const groups = mergeIntoExisting(snapshot.existing, snapshot.ungrouped);
      await applyMergeGroups(
        windowId,
        groups,
        new Set(movable.map((tab) => tab.id)),
        existingIds
      );
      return;
    }

    const tabs = await collectUngroupedTabs(windowId);
    if (tabs.length < 2) {
      result = "grey";
      return;
    }

    const groups = clusterTabs(tabs);
    await applyGroups(windowId, groups, new Set(tabs.map((tab) => tab.id)));
  } catch (error) {
    console.error("Group Four failed:", error);
    result = "red";
  } finally {
    await showIconResult(result);
    busy = false;
  }
}

function tabPayload(tab) {
  let host = "";
  try {
    host = new URL(tab.url || "").hostname;
  } catch {
    host = "";
  }
  return {
    id: tab.id,
    title: (tab.title || "").slice(0, 120),
    host,
  };
}

function isSkippable(tab) {
  if (tab.pinned) return true;
  if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE) return true;
  const url = tab.url || "";
  return SKIP_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

async function collectUngroupedTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs
    .filter(
      (tab) =>
        !isSkippable(tab) && tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE
    )
    .map(tabPayload);
}

async function collectMergeSnapshot(windowId) {
  const tabs = (await chrome.tabs.query({ windowId })).filter((tab) => !isSkippable(tab));
  const ungrouped = [];
  const byGroup = new Map();
  for (const tab of tabs) {
    const payload = tabPayload(tab);
    if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
      ungrouped.push(payload);
      continue;
    }
    if (!byGroup.has(tab.groupId)) byGroup.set(tab.groupId, []);
    byGroup.get(tab.groupId).push(payload);
  }

  const existing = await Promise.all(
    [...byGroup.entries()].map(async ([keepId, groupTabs]) => {
      const group = await chrome.tabGroups.get(keepId);
      return {
        keepId,
        name: group.title || "",
        color: group.color,
        tabs: groupTabs,
      };
    })
  );
  return { existing, ungrouped };
}

async function ungroupWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const ids = tabs
    .filter(
      (tab) =>
        !isSkippable(tab) && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
    )
    .map((tab) => tab.id);
  if (ids.length) await chrome.tabs.ungroup(ids);
}

function groupStyle(group) {
  return {
    color: COLORS.includes(group.color) ? group.color : "grey",
    title: String(group.name || "Group").trim().slice(0, 50),
  };
}

async function tryGroupTabs(options) {
  try {
    return await chrome.tabs.group(options);
  } catch (error) {
    console.error("Group Four: tabs.group failed", error, options);
    return null;
  }
}

async function applyGroups(windowId, groups, validIds) {
  const remaining = new Set(validIds);
  const byId = await loadTabMap(windowId);
  const packed = [];
  for (const group of groups) {
    const requested = [
      ...new Set((group.ids || []).map(Number).filter((id) => remaining.has(id))),
    ];
    const ids = stillEligible(byId, requested, true);
    if (ids.length < 2 && group.name !== "Misc") continue;
    if (!ids.length) continue;

    const groupId = await tryGroupTabs({
      tabIds: ids,
      createProperties: { windowId },
    });
    if (groupId == null) continue;
    try {
      await chrome.tabGroups.update(groupId, groupStyle(group));
    } catch (error) {
      console.error("Group Four: tabGroups.update failed", error);
    }
    markGrouped(byId, ids, groupId);
    packed.push(groupId);
    for (const id of ids) remaining.delete(id);
  }
  await packGroups(packed);
}

async function applyMergeGroups(windowId, groups, validIds, existingIds) {
  const remaining = new Set(validIds);
  const byId = await loadTabMap(windowId);
  const packed = [];
  for (const group of groups) {
    const requested = [
      ...new Set((group.ids || []).map(Number).filter((id) => remaining.has(id))),
    ];
    const ids = stillEligible(byId, requested, false);
    if (!ids.length) continue;

    const keepId = Number(group.keepId);
    const reuse =
      group.keepId != null && Number.isInteger(keepId) && existingIds.has(keepId);
    if (reuse) {
      const grouped = await tryGroupTabs({ tabIds: ids, groupId: keepId });
      if (grouped == null) continue;
      try {
        await chrome.tabGroups.update(keepId, groupStyle(group));
      } catch (error) {
        console.error("Group Four: tabGroups.update failed", error);
      }
      markGrouped(byId, ids, keepId);
      packed.push(keepId);
      existingIds.delete(keepId);
    } else {
      if (ids.length < 2 && group.name !== "Misc") continue;
      if (!ids.length) continue;
      const groupId = await tryGroupTabs({
        tabIds: ids,
        createProperties: { windowId },
      });
      if (groupId == null) continue;
      try {
        await chrome.tabGroups.update(groupId, groupStyle(group));
      } catch (error) {
        console.error("Group Four: tabGroups.update failed", error);
      }
      markGrouped(byId, ids, groupId);
      packed.push(groupId);
    }
    for (const id of ids) remaining.delete(id);
  }
  await packGroups(packed);
}

async function loadTabMap(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  return new Map(tabs.map((tab) => [tab.id, tab]));
}

function stillEligible(byId, ids, ungroupedOnly) {
  return ids.filter((id) => {
    const tab = byId.get(id);
    if (!tab || isSkippable(tab)) return false;
    if (ungroupedOnly && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      return false;
    }
    return true;
  });
}

function markGrouped(byId, ids, groupId) {
  for (const id of ids) {
    const tab = byId.get(id);
    if (tab) tab.groupId = groupId;
  }
}

async function packGroups(groupIds) {
  const uniqueIds = [...new Set(groupIds.filter((id) => Number.isInteger(id)))];
  if (!uniqueIds.length) return;
  const details = (
    await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          return await chrome.tabGroups.get(id);
        } catch {
          return null;
        }
      })
    )
  ).filter(Boolean);
  details.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  for (const group of details) {
    try {
      await chrome.tabGroups.move(group.id, { index: -1 });
    } catch (error) {
      console.error("Group Four: tabGroups.move failed", error);
    }
  }
}

function startIconSpin() {
  if (iconRestoreTimer != null) {
    clearTimeout(iconRestoreTimer);
    iconRestoreTimer = null;
  }
  stopIconSpin(false);
  chrome.action.setBadgeText({ text: "" });
  iconFrame = 0;
  paintIcon(0);
  iconTimer = setInterval(() => {
    iconFrame = (iconFrame + 1) % 4;
    paintIcon(iconFrame);
  }, 150);
}

function stopIconSpin(restore = true) {
  if (iconTimer != null) {
    clearInterval(iconTimer);
    iconTimer = null;
  }
  if (!restore) return;
  chrome.action.setIcon({
    path: {
      16: "icons/icon16.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
  });
}

async function showIconResult(result) {
  stopIconSpin(false);
  paintIcon(0, RESULT_BORDERS[result] || RESULT_BORDERS.grey);
  if (iconRestoreTimer != null) clearTimeout(iconRestoreTimer);
  iconRestoreTimer = setTimeout(() => {
    iconRestoreTimer = null;
    stopIconSpin(true);
  }, RESULT_HOLD_MS);
}

function paintIcon(frame, border) {
  chrome.action.setIcon({
    imageData: {
      16: drawIcon(16, frame, border),
      48: drawIcon(48, frame, border),
      128: drawIcon(128, frame, border),
    },
  });
}

function drawIcon(size, frame, border) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgb(18, 28, 45)";
  ctx.fillRect(0, 0, size, size);
  const pad = Math.max(1, Math.floor(size / 8));
  const gap = Math.max(1, Math.floor(size / 16));
  const inner = size - pad * 2;
  const tile = Math.floor((inner - gap) / 2);
  const positions = [
    [pad, pad],
    [pad + tile + gap, pad],
    [pad + tile + gap, pad + tile + gap],
    [pad, pad + tile + gap],
  ];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = positions[i];
    ctx.fillStyle = ICON_SQUARE_COLORS[(i - frame + 4) % 4];
    ctx.fillRect(x, y, tile, tile);
  }
  if (border) {
    const width = Math.max(2, Math.floor(size / 16));
    ctx.strokeStyle = border;
    ctx.lineWidth = width;
    ctx.strokeRect(width / 2, width / 2, size - width, size - width);
  }
  return ctx.getImageData(0, 0, size, size);
}
