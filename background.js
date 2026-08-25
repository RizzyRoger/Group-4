const DEFAULT_MODEL = "grok-4-fast";
const FALLBACK_MODEL = "grok-4.6";
const DEFAULT_MODE = "ungrouped_only";
const XAI_URL = "https://api.x.ai/v1/chat/completions";
const MAX_TOKENS = 400;
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
    "Mode: only ungrouped tabs. Input is a JSON array of {id, title, host}. Ignore keepId.",
  regroup_all:
    "Mode: regroup all tabs. Input is a JSON array of {id, title, host}. Ignore keepId. Propose a full grouping from scratch.",
  merge_smart:
    "Mode: keep existing groups when they still make sense. Input is {existing:[{keepId,name,color,tabs:[{id,title,host}]}], ungrouped:[{id,title,host}]}. Reuse keepId to add tabs to that group or rename it. Omit keepId to create a new group. Do not list groups you want left unchanged. A tab appears in at most one returned group.",
};

let skillCache;

chrome.runtime.onInstalled.addListener(() => {
  setupMenus();
});

chrome.runtime.onStartup.addListener(() => {
  setupMenus();
});

setupMenus();

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (!MODES[info.menuItemId]) return;
  await setMode(info.menuItemId);
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await groupCurrentWindow(tab.windowId);
  } catch (error) {
    console.error("Group Four failed:", error);
    await flashBadge("!", "#c0392b");
  }
});

async function setupMenus() {
  const { mode } = await chrome.storage.local.get("mode");
  const current = MODES[mode] ? mode : DEFAULT_MODE;
  await chrome.storage.local.set({ mode: current });
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "grouping_mode",
    title: "Grouping mode",
    contexts: ["action"],
  });
  for (const [id, { title }] of Object.entries(MODES)) {
    chrome.contextMenus.create({
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
  await setBadge("...", "#2563eb");

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
      await flashBadge("-", "#6b7280");
      return;
    }
    const result = await requestGroups(
      apiKey,
      model || DEFAULT_MODEL,
      snapshot,
      activeMode
    );
    await applyMergeGroups(
      windowId,
      result.groups || [],
      new Set(movable.map((tab) => tab.id)),
      new Set(snapshot.existing.map((group) => group.keepId))
    );
    await flashBadge("OK", "#16a34a");
    return;
  }

  const tabs = await collectUngroupedTabs(windowId);
  if (tabs.length < 2) {
    await flashBadge("-", "#6b7280");
    return;
  }

  const payload = tabs.map(({ id, title, host }) => ({ id, title, host }));
  const result = await requestGroups(
    apiKey,
    model || DEFAULT_MODEL,
    payload,
    activeMode
  );
  await applyGroups(windowId, result.groups || [], new Set(tabs.map((t) => t.id)));
  await flashBadge("OK", "#16a34a");
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

async function applyGroups(windowId, groups, validIds) {
  const remaining = new Set(validIds);
  for (const group of groups) {
    const requested = [
      ...new Set((group.ids || []).map(Number).filter((id) => remaining.has(id))),
    ];
    const ids = await stillEligible(windowId, requested, true);
    if (ids.length < 2) continue;

    const groupId = await chrome.tabs.group({
      tabIds: ids,
      createProperties: { windowId },
    });
    await chrome.tabGroups.update(groupId, groupStyle(group));
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
      await chrome.tabs.group({ tabIds: ids, groupId: keepId });
      await chrome.tabGroups.update(keepId, groupStyle(group));
      existingIds.delete(keepId);
    } else {
      if (ids.length < 2) continue;
      const groupId = await chrome.tabs.group({
        tabIds: ids,
        createProperties: { windowId },
      });
      await chrome.tabGroups.update(groupId, groupStyle(group));
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

async function setBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

async function flashBadge(text, color) {
  await setBadge(text, color);
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
  }, 2500);
}
