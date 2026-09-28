const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "are",
  "article",
  "as",
  "at",
  "be",
  "best",
  "blog",
  "but",
  "buy",
  "by",
  "chat",
  "chrome",
  "com",
  "comment",
  "comments",
  "compared",
  "docs",
  "download",
  "drive",
  "edit",
  "extension",
  "facebook",
  "for",
  "free",
  "from",
  "github",
  "gmail",
  "google",
  "guide",
  "home",
  "how",
  "html",
  "http",
  "https",
  "images",
  "in",
  "inbox",
  "index",
  "instagram",
  "is",
  "it",
  "its",
  "listing",
  "login",
  "mail",
  "maps",
  "mobile",
  "net",
  "new",
  "news",
  "of",
  "official",
  "on",
  "online",
  "open",
  "or",
  "org",
  "outlook",
  "page",
  "pdf",
  "post",
  "price",
  "reddit",
  "results",
  "review",
  "reviews",
  "search",
  "sheets",
  "shop",
  "sign",
  "signin",
  "signup",
  "site",
  "slides",
  "store",
  "tab",
  "that",
  "the",
  "this",
  "thread",
  "to",
  "top",
  "twitter",
  "untitled",
  "video",
  "view",
  "vs",
  "was",
  "watch",
  "website",
  "were",
  "what",
  "when",
  "where",
  "who",
  "why",
  "wikipedia",
  "with",
  "www",
  "yahoo",
  "you",
  "your",
  "youtube",
  "account",
  "accounts",
  "amazon",
]);

const GENERIC_HOST_PARTS = new Set([
  "www",
  "www2",
  "com",
  "net",
  "org",
  "co",
  "uk",
  "io",
  "edu",
  "gov",
  "app",
  "mail",
  "docs",
  "accounts",
  "drive",
  "google",
]);

const ASSOCIATION_CLUSTERS = [
  {
    name: "School",
    tokens: [
      "school",
      "classroom",
      "plusportals",
      "plusportal",
      "canvas",
      "schoology",
      "powerschool",
      "gradescope",
      "blackboard",
      "edgenuity",
      "gmail",
    ],
  },
];

const TOKEN_TO_TOPIC = new Map();
for (const cluster of ASSOCIATION_CLUSTERS) {
  for (const token of cluster.tokens) {
    TOKEN_TO_TOPIC.set(token, cluster.name);
  }
}

const GROUP_PALETTE = [
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

const MAX_TOKENS = 10;

function splitWords(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isNumeric(token) {
  return /^\d+$/.test(token);
}

function isSpecific(token) {
  return token.length >= 4 || /\d/.test(token) || TOKEN_TO_TOPIC.has(token);
}

function tokenRank(token) {
  let score = token.length;
  if (/\d/.test(token)) score += 12;
  if (TOKEN_TO_TOPIC.has(token)) score += 8;
  return score;
}

function unique(list) {
  return [...new Set(list)];
}

function tokenize(text) {
  return unique(
    splitWords(text).filter(
      (token) =>
        !STOPWORDS.has(token) && (token.length >= 2 || isNumeric(token))
    )
  );
}

function hostTokens(host) {
  if (!host) return [];
  const labels = splitWords(host.replace(/\./g, " ")).filter(
    (token) => !GENERIC_HOST_PARTS.has(token) && !STOPWORDS.has(token)
  );
  if (host.includes("classroom.google")) labels.push("classroom");
  if (host.includes("plusportals")) labels.push("plusportals");
  if (host.includes("mail.google") || host.includes("gmail")) labels.push("gmail");
  return unique(labels);
}

function analyzeTab(tab) {
  const raw = unique([...splitWords(tab.title), ...hostTokens(tab.host)]);
  const ranked = unique(
    raw.filter(
      (token) =>
        !STOPWORDS.has(token) && (token.length >= 2 || isNumeric(token))
    )
  ).sort((a, b) => tokenRank(b) - tokenRank(a) || b.length - a.length);
  const tokens = ranked.slice(0, MAX_TOKENS);
  const topics = [];
  for (const word of raw) {
    const topic = TOKEN_TO_TOPIC.get(word);
    if (topic) topics.push(topic);
  }
  return {
    id: tab.id,
    tokenSet: new Set(tokens),
    pairs: pairsOf(tokens),
    topics: unique(topics),
  };
}

function pairsOf(tokens) {
  const pairs = [];
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i + 1; j < tokens.length; j += 1) {
      const a = tokens[i];
      const b = tokens[j];
      if (!isSpecific(a) && !isSpecific(b)) continue;
      pairs.push(a < b ? `${a} ${b}` : `${b} ${a}`);
    }
  }
  return pairs;
}

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return GROUP_PALETTE[hash % GROUP_PALETTE.length];
}

function titleCase(part) {
  if (isNumeric(part)) return part;
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function displayName(key) {
  if (key.startsWith("topic:")) return key.slice(6);
  const parts = key.split(" ");
  if (parts.length === 2) {
    const specific = parts.find((part) => /[a-z]/.test(part) && /\d/.test(part));
    if (specific) return titleCase(specific);
    return parts.map(titleCase).join(" ");
  }
  return titleCase(parts[0] || key);
}

function baseName(name) {
  return String(name || "").replace(/\s*\(\d+\)\s*$/, "").trim();
}

function addCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function scoreKey(kind, df, extra) {
  if (kind === "pair") return 400 + extra - df;
  if (kind === "token") return 200 + extra * 8 - df * 2;
  return 80 - df;
}

function candidateKeys(item, keys) {
  const found = [];
  for (const token of item.tokenSet) {
    const meta = keys.get(token);
    if (meta) found.push([token, meta]);
  }
  for (const pair of item.pairs) {
    const meta = keys.get(pair);
    if (meta) found.push([pair, meta]);
  }
  for (const topic of item.topics) {
    const key = `topic:${topic}`;
    const meta = keys.get(key);
    if (meta) found.push([key, meta]);
  }
  found.sort((a, b) => {
    const sa = scoreKey(a[1].kind, a[1].df, a[1].extra);
    const sb = scoreKey(b[1].kind, b[1].df, b[1].extra);
    return sb - sa || b[0].length - a[0].length;
  });
  return found;
}

const MAX_CONTEXT_GROUPS = 5;
const TYPE_MIN_SIZE = 4;
const MERGE_SCORE_FLOOR = 70;

function minContextSize(tabCount) {
  return tabCount >= 40 ? 4 : 3;
}

function clusterTabs(tabs) {
  const items = tabs.map(analyzeTab);
  const minCover = minContextSize(tabs.length);
  const tokenDf = new Map();
  const pairDf = new Map();
  const topicDf = new Map();
  for (const item of items) {
    for (const token of item.tokenSet) addCount(tokenDf, token);
    for (const pair of item.pairs) addCount(pairDf, pair);
    for (const topic of item.topics) addCount(topicDf, topic);
  }

  const keys = new Map();
  for (const [token, df] of tokenDf) {
    if (df < minCover || isNumeric(token)) continue;
    keys.set(token, { kind: "token", df, extra: token.length });
  }
  for (const [pair, df] of pairDf) {
    if (df >= minCover) keys.set(pair, { kind: "pair", df, extra: pair.length });
  }
  for (const [topic, df] of topicDf) {
    if (df >= minCover) keys.set(`topic:${topic}`, { kind: "topic", df, extra: 0 });
  }

  const members = new Map();
  for (const item of items) {
    for (const [key] of candidateKeys(item, keys)) {
      if (!members.has(key)) members.set(key, []);
      members.get(key).push(item.id);
    }
  }

  const remaining = new Set(items.map((item) => item.id));
  const order = new Map(tabs.map((tab, index) => [tab.id, index]));
  const groups = [];
  const usedKeys = new Set();

  while (groups.length < MAX_CONTEXT_GROUPS && remaining.size >= minCover) {
    let bestKey = null;
    let bestIds = [];
    let bestScore = -1;
    for (const [key, ids] of members) {
      if (usedKeys.has(key)) continue;
      const cover = unique(ids.filter((id) => remaining.has(id)));
      if (cover.length < minCover) continue;
      const meta = keys.get(key);
      const score = cover.length * 1000 + scoreKey(meta.kind, meta.df, meta.extra);
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
        bestIds = cover;
      }
    }
    if (!bestKey) break;
    usedKeys.add(bestKey);
    for (const id of bestIds) remaining.delete(id);
    const name = displayName(bestKey);
    bestIds.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    groups.push({
      name,
      color: colorForName(name),
      ids: bestIds,
      keepId: null,
      kind: "context",
    });
  }

  groups.sort((a, b) => b.ids.length - a.ids.length);
  return withTypeAndMisc(tabs, groups);
}

function detectType(tab) {
  const host = String(tab.host || "").toLowerCase();
  const title = String(tab.title || "").toLowerCase();
  if (host.includes("mail.google") || host.includes("gmail") || /\bgmail\b/.test(title)) {
    return "Gmail";
  }
  if (
    host.includes("docs.google") ||
    host.includes("sheets.google") ||
    host.includes("slides.google") ||
    host.includes("drive.google") ||
    title.includes("google docs") ||
    title.includes("google sheets") ||
    title.includes("google slides") ||
    title.includes("google drive")
  ) {
    return "Docs";
  }
  if (host.includes("youtube.") || host.endsWith("youtube.com") || host.includes("youtu.be")) {
    return "YouTube";
  }
  return "";
}

function unusedTabs(tabs, groups) {
  const used = new Set(groups.flatMap((group) => group.ids));
  return tabs.filter((tab) => !used.has(tab.id));
}

function typeAndMiscGroups(tabs) {
  if (!tabs.length) return [];
  const order = new Map(tabs.map((tab, index) => [tab.id, index]));
  const byType = new Map();
  const rest = [];
  for (const tab of tabs) {
    const type = detectType(tab);
    if (!type) {
      rest.push(tab);
      continue;
    }
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(tab);
  }

  const groups = [];
  for (const [name, typed] of byType) {
    if (typed.length >= TYPE_MIN_SIZE) {
      const ids = typed
        .map((tab) => tab.id)
        .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
      groups.push({
        name,
        color: colorForName(name),
        ids,
        keepId: null,
        kind: "type",
      });
    } else {
      rest.push(...typed);
    }
  }

  if (rest.length) {
    const ids = rest
      .map((tab) => tab.id)
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    groups.push({
      name: "Misc",
      color: "grey",
      ids,
      keepId: null,
      kind: "misc",
    });
  }
  return groups;
}

function groupKind(name) {
  const base = baseName(name);
  if (base === "Misc") return "misc";
  if (base === "Docs" || base === "Gmail" || base === "YouTube") return "type";
  return "context";
}

function withTypeAndMisc(tabs, groups) {
  groups.push(...typeAndMiscGroups(unusedTabs(tabs, groups)));
  return groups;
}

function intersectionSize(a, b) {
  let n = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const value of smaller) {
    if (larger.has(value)) n += 1;
  }
  return n;
}

function scoreAgainstGroup(item, groupTokens, groupTopics) {
  const shared = intersectionSize(item.tokenSet, groupTokens);
  if (shared >= 2) return 400 + shared * 20;
  if (shared === 1) {
    let token;
    for (const value of item.tokenSet) {
      if (groupTokens.has(value)) {
        token = value;
        break;
      }
    }
    if (!token || isNumeric(token) || !isSpecific(token)) return 0;
    return 180 + token.length * 8;
  }
  for (const topic of item.topics) {
    if (groupTopics.has(topic)) return 100;
  }
  return 0;
}

function mergeIntoExisting(existing, ungrouped) {
  const prepared = existing.map((group) => {
    const analyzed = group.tabs.map(analyzeTab);
    const tokens = unique([
      ...tokenize(baseName(group.name)),
      ...analyzed.flatMap((item) => [...item.tokenSet]),
    ]);
    const topics = new Set();
    for (const item of analyzed) {
      for (const topic of item.topics) topics.add(topic);
    }
    for (const token of tokens) {
      const topic = TOKEN_TO_TOPIC.get(token);
      if (topic) topics.add(topic);
    }
    return {
      keepId: group.keepId,
      name: group.name,
      color: group.color,
      tokens: new Set(tokens),
      topics,
      ids: group.tabs.map((tab) => tab.id),
    };
  });

  const leftovers = [];
  for (const tab of ungrouped) {
    const item = analyzeTab(tab);
    const type = detectType(tab);
    let best = null;
    for (const group of prepared) {
      let score = scoreAgainstGroup(item, group.tokens, group.topics);
      if (type && type === baseName(group.name)) score = Math.max(score, 80);
      if (score < MERGE_SCORE_FLOOR) continue;
      if (!best || score > best.score) best = { group, score };
    }
    if (best) best.group.ids.push(tab.id);
    else leftovers.push(tab);
  }

  const groups = prepared
    .filter((group) => group.ids.length)
    .map((group) => ({
      name: baseName(group.name) || group.name,
      color: group.color || colorForName(group.name || "Group"),
      ids: unique(group.ids),
      keepId: group.keepId,
      kind: groupKind(baseName(group.name)),
    }));

  groups.push(...clusterTabs(leftovers));
  return groups;
}

if (typeof globalThis !== "undefined") {
  globalThis.clusterTabs = clusterTabs;
  globalThis.mergeIntoExisting = mergeIntoExisting;
  globalThis.tokenize = tokenize;
}
