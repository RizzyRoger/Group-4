const DEFAULT_MODEL = "grok-4-fast";
const FALLBACK_MODEL = "grok-4.6";
const DEFAULT_MODE = "ungrouped_only";
const XAI_URL = "https://api.x.ai/v1/chat/completions";
const MAX_TOKENS = 1200;
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

const RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "tab_groups",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["groups"],
      properties: {
        groups: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "color", "ids", "keepId"],
            properties: {
              name: { type: "string" },
              color: { type: "string", enum: COLORS },
              ids: { type: "array", items: { type: "integer" } },
              keepId: { type: ["integer", "null"] },
            },
          },
        },
      },
    },
  },
};

const SKIP_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "about:",
  "edge://",
  "devtools://",
];

const MODE_INSTRUCTIONS = {
  ungrouped_only:
    "Mode: only ungrouped tabs. Input is a JSON array of {id, title, host}. Ignore keepId. Put every id that belongs with another tab into a group.",
  regroup_all:
    "Mode: regroup all tabs. Input is a JSON array of {id, title, host}. Ignore keepId. Propose a full grouping from scratch. Put every id that belongs with another tab into a group.",
  merge_smart:
    "Mode: keep existing groups when they still make sense. Input is {existing:[{keepId,name,color,tabs:[{id,title,host}]}], ungrouped:[{id,title,host}]}. Reuse keepId to add tabs to that group or rename it. Omit keepId to create a new group. Do not list groups you want left unchanged. A tab appears in at most one returned group. Put every ungrouped id that belongs with others into a keepId or a new group.",
};

let skillCache;
let iconTimer = null;
let iconFrame = 0;
let iconRestoreTimer = null;

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
  const current = MODES[mode] ? mode : DEFAULT_MODE;
  await chrome.storage.local.set({ mode: current });
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
      checked: id === current,
      contexts: ["action"],
    });
  }
  await updateTooltip(current);
}

async function setMode(mode) {
  await chrome.storage.local.set({ mode });
  await updateTooltip(mode);
}

async function updateTooltip(mode) {
  const meta = MODES[mode] || MODES[DEFAULT_MODE];
  await chrome.action.setTitle({ title: meta.tooltip });
}

async function groupCurrentWindow(windowId) {
  const { apiKey, model, mode } = await chrome.storage.local.get([
    "apiKey",
    "model",
    "mode",
  ]);
  if (!apiKey) {
    await chrome.runtime.openOptionsPage();
    return;
  }

  const activeMode = MODES[mode] ? mode : DEFAULT_MODE;
  const resolvedModel = model || DEFAULT_MODEL;
  let result = "green";
  startIconSpin();

  try {
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
      const grokResult = await requestGroups(apiKey, resolvedModel, snapshot, activeMode);
      await applyMergeGroups(
        windowId,
        grokResult.groups || [],
        new Set(movable.map((tab) => tab.id)),
        existingIds
      );
      await groupLeftovers(
        windowId,
        apiKey,
        resolvedModel,
        new Set(snapshot.ungrouped.map((tab) => tab.id))
      );
      return;
    }

    const tabs = await collectUngroupedTabs(windowId);
    if (tabs.length < 2) {
      result = "grey";
      return;
    }

    const payload = tabs.map(({ id, title, host }) => ({ id, title, host }));
    const grokResult = await requestGroups(apiKey, resolvedModel, payload, activeMode);
    await applyGroups(windowId, grokResult.groups || [], new Set(tabs.map((t) => t.id)));
    await groupLeftovers(
      windowId,
      apiKey,
      resolvedModel,
      new Set(tabs.map((tab) => tab.id))
    );
  } catch (error) {
    console.error("Group Four failed:", error);
    result = "red";
  } finally {
    await showIconResult(result);
  }
}

async function groupLeftovers(windowId, apiKey, model, sentIds) {
  const leftover = (await collectUngroupedTabs(windowId)).filter((tab) =>
    sentIds.has(tab.id)
  );
  if (leftover.length < 2) return;
  const payload = leftover.map(({ id, title, host }) => ({ id, title, host }));
  const result = await requestGroups(apiKey, model, payload, "ungrouped_only");
  await applyGroups(windowId, result.groups || [], new Set(leftover.map((tab) => tab.id)));
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

  const existing = [];
  for (const [keepId, groupTabs] of byGroup) {
    const group = await chrome.tabGroups.get(keepId);
    existing.push({
      keepId,
      name: group.title || "",
      color: group.color,
      tabs: groupTabs,
    });
  }
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

async function getSkill() {
  if (skillCache) return skillCache;
  const response = await fetch(chrome.runtime.getURL("SKILL.md"));
  skillCache = await response.text();
  return skillCache;
}

async function requestGroups(apiKey, model, payload, mode) {
  const skill = await getSkill();
  const instruction = MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS[DEFAULT_MODE];
  const messages = [
    { role: "system", content: `${skill}\n${instruction}` },
    { role: "user", content: JSON.stringify(payload) },
  ];

  let lastError;
  for (const candidate of uniqueModels(model)) {
    try {
      return await callGrok(apiKey, candidate, messages, RESPONSE_SCHEMA);
    } catch (error) {
      lastError = error;
      if (isAuthError(error)) throw error;
      if (!isModelError(error)) break;
    }
  }

  try {
    return await callGrok(apiKey, model || DEFAULT_MODEL, messages, {
      type: "json_object",
    });
  } catch (error) {
    throw lastError || error;
  }
}

function uniqueModels(preferred) {
  return [...new Set([preferred || DEFAULT_MODEL, FALLBACK_MODEL])];
}

function isAuthError(error) {
  return error && (error.status === 401 || error.status === 403);
}

function isModelError(error) {
  const text = String(error && error.message ? error.message : error).toLowerCase();
  return /model.*(not found|invalid|does not exist)|unknown model|invalid model/.test(
    text
  );
}

async function callGrok(apiKey, model, messages, responseFormat) {
  const response = await fetch(XAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      max_tokens: MAX_TOKENS,
      response_format: responseFormat,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.error?.message || body.error || response.statusText;
    const error = new Error(`Grok ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }

  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Grok returned an empty response.");
  return parseGroups(content);
}

function parseGroups(content) {
  let text = String(content).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.groups)) {
    throw new Error("Grok response was missing groups.");
  }
  return parsed;
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
  for (const group of groups) {
    const requested = [
      ...new Set((group.ids || []).map(Number).filter((id) => remaining.has(id))),
    ];
    const ids = await stillEligible(windowId, requested, true);
    if (ids.length < 2) continue;

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
    for (const id of ids) remaining.delete(id);
  }
}

async function applyMergeGroups(windowId, groups, validIds, existingIds) {
  const remaining = new Set(validIds);
  for (const group of groups) {
    const requested = [
      ...new Set((group.ids || []).map(Number).filter((id) => remaining.has(id))),
    ];
    const ids = await stillEligible(windowId, requested, false);
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
      existingIds.delete(keepId);
    } else {
      if (ids.length < 2) continue;
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
    }
    for (const id of ids) remaining.delete(id);
  }
}

async function stillEligible(windowId, ids, ungroupedOnly) {
  const tabs = await chrome.tabs.query({ windowId });
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  return ids.filter((id) => {
    const tab = byId.get(id);
    if (!tab || isSkippable(tab)) return false;
    if (ungroupedOnly && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      return false;
    }
    return true;
  });
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
  }, 2500);
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
