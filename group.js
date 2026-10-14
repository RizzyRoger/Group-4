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
  "devpost",
  "linkedin",
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
      "classroom",
      "plusportals",
      "plusportal",
      "canvas",
      "schoology",
      "powerschool",
      "gradescope",
      "blackboard",
      "edgenuity",
      "homework",
      "assignment",
      "coursework",
    ],
  },
  {
    name: "Debate",
    tokens: ["1nc", "2ac", "1ac", "ndca", "debate"],
  },
  {
    name: "Electronics",
    tokens: [
      "pedal",
      "schematic",
      "pcb",
      "resistor",
      "capacitor",
      "distortion",
      "overdrive",
    ],
  },
];

const TOKEN_TO_TOPIC = new Map();
for (const cluster of ASSOCIATION_CLUSTERS) {
  for (const token of cluster.tokens) {
    TOKEN_TO_TOPIC.set(token, cluster.name);
  }
}

const SITE_TOPICS = [
  {
    name: "School",
    hosts: [
      "plusportals.com",
      "classroom.google.com",
      "pearson.com",
      "mybib.com",
      "quizlet.com",
      "khanacademy.org",
      "gradescope.com",
      "desmos.com",
      "schoology.com",
      "instructure.com",
      "powerschool.com",
      "edpuzzle.com",
      "fiveable.me",
      "lumisource.io",
      "spanishdict.com",
      "digitalhistory.uh.edu",
    ],
  },
  {
    name: "Coding",
    hosts: [
      "stackoverflow.com",
      "developer.mozilla.org",
      "developer.chrome.com",
      "kaggle.com",
      "colab.research.google.com",
      "huggingface.co",
      "arxiv.org",
    ],
  },
  {
    name: "Hackathon",
    hosts: ["mlh.io", "hackclub.com"],
  },
  {
    name: "Electronics",
    hosts: ["digikey.com", "pcbway.com"],
  },
  {
    name: "Comics",
    hosts: [
      "xkcd.com",
      "buttersafe.com",
      "asofterworld.com",
      "threewordphrase.com",
      "smbc-comics.com",
      "explosm.net",
      "questionablecontent.net",
      "webtoons.com",
      "mangadex.org",
      "weebcentral.com",
    ],
  },
];

function isDevpostPortfolio(url) {
  try {
    const parsed = new URL(url || "");
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "devpost.com") return false;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length === 1;
  } catch {
    return false;
  }
}

function isDevpostEvent(host, url) {
  const h = String(host || "").toLowerCase();
  if (h === "devpost.com" || h.endsWith(".devpost.com")) {
    return !isDevpostPortfolio(url);
  }
  return false;
}

function siteTopic(host, url) {
  const h = String(host || "").toLowerCase();
  if (!h) return "";
  if (isDevpostEvent(h, url)) return "Hackathon";
  for (const topic of SITE_TOPICS) {
    if (topic.hosts.some((site) => h === site || h.endsWith(`.${site}`))) {
      return topic.name;
    }
  }
  return "";
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

const GENERIC_NOISE = new Set([
  "access",
  "blocked",
  "captcha",
  "denied",
  "error",
  "forbidden",
  "loading",
  "please",
  "software",
  "sorry",
  "success",
  "unauthorized",
  "unavailable",
  "warning",
]);

const MAX_TOKENS = 10;

function splitWords(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

let personalWords = new Set();

function stripEmails(text) {
  return String(text || "").replace(EMAIL_PATTERN, (email) => ` ${email.split("@")[1]} `);
}

function stripTitleChrome(text) {
  let s = String(text || "");
  s = s.replace(/\s+-\s+[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\s+-\s+.*$/i, "");
  s = s.replace(/\s+-\s+(?:[\w.-]+\s+)*(?:workspace\s+)?mail\s*$/i, "");
  s = s.replace(/\s+-\s+gmail\s*$/i, "");
  return s;
}

function titleWords(text) {
  return splitWords(stripEmails(stripTitleChrome(text))).filter(
    (word) => !personalWords.has(word)
  );
}

const GENERIC_MAIL_SUBJECTS = new Set([
  "inbox",
  "sent",
  "draft",
  "drafts",
  "spam",
  "starred",
  "unread",
  "snoozed",
  "scheduled",
  "important",
  "subject",
  "no",
]);

function schoolEmailTopic(title) {
  let schoolDomain = false;
  for (const email of String(title || "").match(EMAIL_PATTERN) || []) {
    const domain = email.split("@")[1].toLowerCase();
    if (domain.includes("student.") || domain.endsWith(".edu")) schoolDomain = true;
  }
  if (!schoolDomain) return "";
  const words = titleWords(title).filter((word) => !isNumeric(word));
  if (!words.length || words.every((word) => GENERIC_MAIL_SUBJECTS.has(word))) return "";
  for (const word of words) {
    const topic = TOKEN_TO_TOPIC.get(word);
    if (topic && topic !== "School") return "";
  }
  return "School";
}

function setPersonalWords(words) {
  personalWords = new Set((words || []).map((word) => String(word).toLowerCase()));
}

function learnPersonalWords(titles) {
  const locals = [];
  const words = new Set();
  for (const title of titles) {
    for (const email of String(title || "").match(EMAIL_PATTERN) || []) {
      locals.push(email.split("@")[0].toLowerCase());
    }
    for (const word of splitWords(stripEmails(stripTitleChrome(title)))) {
      if (word.length >= 3 && !isNumeric(word) && !TOKEN_TO_TOPIC.has(word)) {
        words.add(word);
      }
    }
  }
  const found = new Set();
  for (const local of locals) {
    for (const part of local.split(/[^a-z]+/)) {
      if (words.has(part)) found.add(part);
      for (let i = 3; i <= part.length - 3; i += 1) {
        const head = part.slice(0, i);
        const tail = part.slice(i);
        if (words.has(head) && words.has(tail)) {
          found.add(head);
          found.add(tail);
        }
      }
    }
  }
  return [...found];
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
    titleWords(text).filter(
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
  const host = effectiveHost(tab);
  const raw = unique([...titleWords(tab.title), ...hostTokens(host)]);
  const ranked = unique(
    raw.filter(
      (token) =>
        !STOPWORDS.has(token) && (token.length >= 2 || isNumeric(token))
    )
  ).sort((a, b) => tokenRank(b) - tokenRank(a) || b.length - a.length);
  const tokens = ranked.slice(0, MAX_TOKENS);
  const fromSite = siteTopic(host, tab.url);
  const topics = [];
  if (fromSite) {
    topics.push(fromSite);
  } else {
    for (const word of raw) {
      const topic = TOKEN_TO_TOPIC.get(word);
      if (topic) topics.push(topic);
    }
  }
  const fromEmail = schoolEmailTopic(tab.title);
  if (fromEmail) topics.push(fromEmail);
  return {
    id: tab.id,
    tokenSet: new Set(tokens),
    topics: unique(topics),
  };
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

function baseName(name) {
  return String(name || "").replace(/\s*\(\d+\)\s*$/, "").trim();
}

function addCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function isNoiseToken(token) {
  return GENERIC_NOISE.has(token);
}

const TYPE_MIN_SIZE = 2;
const MERGE_SCORE_FLOOR = 70;

const LINK_THRESHOLD = 0.01;
const LINK_MIN_SIZE = 3;
const SITE_BONUS = 0.35;
const TOPIC_BONUS = 0.4;
const RESERVED_NAMES = ["Docs", "Gmail", "YouTube", "Chat", "Misc"];
const MAX_CONTEXT_GROUPS = 6;
const TOPIC_NAME_TOKENS = new Set([
  "school",
  "debate",
  "hackathon",
  "electronics",
  "coding",
  "comics",
  "chat",
  "docs",
  "gmail",
  "youtube",
  "misc",
]);

const NO_SIGNAL_SITES = new Set([
  "google.com",
  "docs.google.com",
  "drive.google.com",
  "mail.google.com",
  "calendar.google.com",
]);

function hostFromMaybeUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return new URL(s).hostname.toLowerCase();
    if (s.includes("/") && s.includes(".")) return new URL(`https://${s}`).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(s)) return s.toLowerCase();
  return "";
}

function destinationHost(url) {
  try {
    const parsed = new URL(url || "");
    for (const key of ["d", "url", "u"]) {
      const host = hostFromMaybeUrl(parsed.searchParams.get(key));
      if (host) return host;
    }
  } catch {
    return "";
  }
  return "";
}

function effectiveHost(tab) {
  return destinationHost(tab && tab.url) || String((tab && tab.host) || "").toLowerCase();
}

function siteKey(host) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!h) return "";
  if (h === "google.com" || h.endsWith(".google.com")) return h;
  const parts = h.split(".");
  if (parts.length > 2 && ["co", "com", "org", "ac"].includes(parts[parts.length - 2])) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function hasSiteSignal(host) {
  if (!host || isHugeHost(host)) return false;
  const key = siteKey(host);
  if (key === "devpost.com" || key === "github.com" || key === "linkedin.com") return false;
  return !NO_SIGNAL_SITES.has(key);
}

function stem(token) {
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function linkFeatures(tab) {
  const host = effectiveHost(tab);
  const tokens = new Set(
    [...tokenize(tab.title), ...hostTokens(host)]
      .filter(
        (token) =>
          !STOPWORDS.has(token) &&
          !isNumeric(token) &&
          !isNoiseToken(token) &&
          (token.length >= 4 || /\d/.test(token) || TOKEN_TO_TOPIC.has(token))
      )
      .map(stem)
  );
  return {
    id: tab.id,
    tokens,
    topics: new Set(analyzeTab(tab).topics),
    site: hasSiteSignal(host) ? siteKey(host) : "",
  };
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  const shared = intersectionSize(a, b);
  return shared / (a.size + b.size - shared);
}

function similarity(a, b) {
  let sim = jaccard(a.tokens, b.tokens);
  if (a.site && a.site === b.site) sim += SITE_BONUS;
  if (intersectionSize(a.topics, b.topics) > 0) sim += TOPIC_BONUS;
  return Math.min(1, sim);
}

function averageLinkage(feats, threshold) {
  const n = feats.length;
  const sum = [];
  for (let i = 0; i < n; i += 1) {
    sum.push(new Array(n).fill(0));
    for (let j = 0; j < i; j += 1) {
      const s = similarity(feats[i], feats[j]);
      sum[i][j] = s;
      sum[j][i] = s;
    }
  }
  const members = feats.map((f) => [f]);
  const alive = new Set(feats.map((_, i) => i));

  while (alive.size > 1) {
    let best = -1;
    let bi = -1;
    let bj = -1;
    const live = [...alive];
    for (let x = 0; x < live.length; x += 1) {
      for (let y = x + 1; y < live.length; y += 1) {
        const i = live[x];
        const j = live[y];
        const avg = sum[i][j] / (members[i].length * members[j].length);
        if (avg > best) {
          best = avg;
          bi = i;
          bj = j;
        }
      }
    }
    if (best < threshold) break;
    for (const k of alive) {
      if (k === bi || k === bj) continue;
      sum[bi][k] += sum[bj][k];
      sum[k][bi] = sum[bi][k];
    }
    members[bi].push(...members[bj]);
    alive.delete(bj);
  }
  return [...alive].map((i) => members[i]);
}

function nameCandidates(members) {
  const topicCount = new Map();
  const tokenCount = new Map();
  const siteCount = new Map();
  for (const f of members) {
    for (const topic of f.topics) addCount(topicCount, topic);
    for (const token of f.tokens) addCount(tokenCount, token);
    if (f.site) addCount(siteCount, f.site);
  }
  const ranked = (map) =>
    [...map].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const names = [];
  const topic = ranked(topicCount)[0];
  if (topic && topic[1] * 2 > members.length) names.push(topic[0]);
  for (const [token, count] of ranked(tokenCount)) {
    if (count >= 2) names.push(titleCase(token));
  }
  const site = ranked(siteCount)[0];
  if (site) names.push(titleCase(site[0].split(".")[0]));
  return names;
}

function nameCluster(members, taken) {
  const name = nameCandidates(members).find((candidate) => !taken.has(candidate));
  if (name) return name;
  let n = 2;
  while (taken.has(`Group ${n}`)) n += 1;
  return taken.has("Group") ? `Group ${n}` : "Group";
}

const SITE_TOPIC_NAMES = new Set(SITE_TOPICS.map((topic) => topic.name));

function clusterSharesSiteTopic(cluster) {
  if (cluster.length < 2) return false;
  for (const topic of cluster[0].topics) {
    if (!SITE_TOPIC_NAMES.has(topic)) continue;
    if (cluster.every((item) => item.topics.has(topic))) return true;
  }
  return false;
}

function keepCluster(cluster) {
  if (cluster.length >= LINK_MIN_SIZE) return true;
  if (cluster.length === 2 && clusterSharesSiteTopic(cluster)) return true;
  return false;
}

function tokensOf(members) {
  const tokens = new Set();
  for (const member of members) {
    for (const token of member.tokens) tokens.add(token);
  }
  return tokens;
}

function distinctiveToken(members) {
  const counts = new Map();
  for (const member of members) {
    const seen = new Set();
    for (const token of member.tokens) {
      if (token.length < 5 || TOPIC_NAME_TOKENS.has(token) || seen.has(token)) continue;
      seen.add(token);
      addCount(counts, token);
    }
  }
  const best = [...counts].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
  if (!best || best[1] < 2) return "";
  return best[0];
}

function tokenMentions(tokens, needle) {
  if (!needle || needle.length < 5) return false;
  for (const token of tokens) {
    if (token === needle || token.includes(needle)) return true;
  }
  return false;
}

function absorbSmallerGroups(groups) {
  const ranked = [...groups].sort(
    (a, b) => b.ids.length - a.ids.length || a.name.localeCompare(b.name)
  );
  const used = new Set();
  const kept = [];
  for (let i = 0; i < ranked.length; i += 1) {
    if (used.has(i)) continue;
    const large = ranked[i];
    let largeTokens = tokensOf(large.members);
    let largeToken = distinctiveToken(large.members);
    for (let j = i + 1; j < ranked.length; j += 1) {
      if (used.has(j)) continue;
      const small = ranked[j];
      const smallTokens = tokensOf(small.members);
      const smallToken = distinctiveToken(small.members);
      if (
        tokenMentions(largeTokens, smallToken) ||
        tokenMentions(smallTokens, largeToken)
      ) {
        large.ids = unique([...large.ids, ...small.ids]);
        large.members = large.members.concat(small.members);
        largeTokens = tokensOf(large.members);
        largeToken = distinctiveToken(large.members);
        used.add(j);
      }
    }
    kept.push(large);
  }
  return kept;
}

function clusterTabs(tabs) {
  const order = new Map(tabs.map((tab, index) => [tab.id, index]));
  const byOrder = (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  const contextTabs = tabs.filter((tab) => detectType(tab) !== "Chat");
  const feats = contextTabs.map(linkFeatures);
  const clusters = averageLinkage(feats, LINK_THRESHOLD)
    .filter(keepCluster)
    .sort((a, b) => b.length - a.length || byOrder(a[0].id, b[0].id));

  const taken = new Set(RESERVED_NAMES);
  const groups = clusters.map((members) => {
    const name = nameCluster(members, taken);
    taken.add(name);
    return {
      name,
      color: colorForName(name),
      ids: members.map((f) => f.id).sort(byOrder),
      keepId: null,
      kind: "context",
      members,
    };
  });
  const absorbed = absorbSmallerGroups(groups)
    .sort((a, b) => b.ids.length - a.ids.length)
    .slice(0, MAX_CONTEXT_GROUPS)
    .map(({ members, ...group }) => group);
  return withTypeAndMisc(tabs, absorbed);
}

function isHugeHost(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return true;
  if (h.includes("youtube.") || h.includes("youtu.be")) return true;
  if (h === "google.com" || h === "www.google.com") return true;
  if (h.includes("amazon.")) return true;
  if (h.includes("reddit.")) return true;
  if (h.includes("wikipedia.")) return true;
  if (h.includes("facebook.")) return true;
  if (h.includes("instagram.")) return true;
  if (h.includes("twitter.") || h === "x.com" || h.endsWith(".x.com")) return true;
  if (h === "github.com" || h.endsWith(".github.com")) return true;
  if (h === "linkedin.com" || h.endsWith(".linkedin.com")) return true;
  return false;
}

function detectType(tab) {
  const host = effectiveHost(tab);
  const title = String(tab.title || "").toLowerCase();
  if (host.includes("chat.google") || host === "chat.google.com") return "Chat";
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
  if (base === "Docs" || base === "Gmail" || base === "YouTube" || base === "Chat") return "type";
  return "context";
}

function withTypeAndMisc(tabs, groups) {
  groups.push(...typeAndMiscGroups(unusedTabs(tabs, groups)));
  return groups;
}

function titleSortKey(tab) {
  return String(tab.title || "").toLowerCase();
}

function clusterBlockByTitle(tabs) {
  const items = tabs.map((tab, index) => ({
    tab,
    index,
    tokens: tokenize(tab.title).filter((token) => !isNumeric(token)),
  }));
  const assigned = new Set();
  const usedTokens = new Set();
  const ordered = [];

  while (true) {
    let bestToken = null;
    let bestItems = [];
    const remaining = items.filter((item) => !assigned.has(item.tab.id));
    const tokenCover = new Map();
    for (const item of remaining) {
      for (const token of unique(item.tokens)) {
        if (!tokenCover.has(token)) tokenCover.set(token, []);
        tokenCover.get(token).push(item);
      }
    }
    for (const [token, cover] of tokenCover) {
      if (usedTokens.has(token) || cover.length < 2) continue;
      const better =
        cover.length > bestItems.length ||
        (cover.length === bestItems.length &&
          bestToken &&
          (token.length > bestToken.length ||
            (token.length === bestToken.length && token < bestToken)));
      const first = !bestToken && cover.length >= 2;
      if (first || better) {
        bestToken = token;
        bestItems = cover;
      }
    }
    if (!bestToken) break;
    usedTokens.add(bestToken);
    bestItems.sort(
      (a, b) =>
        titleSortKey(a.tab).localeCompare(titleSortKey(b.tab)) || a.index - b.index
    );
    for (const item of bestItems) {
      assigned.add(item.tab.id);
      ordered.push(item.tab.id);
    }
  }

  const rest = items.filter((item) => !assigned.has(item.tab.id));
  rest.sort(
    (a, b) =>
      titleSortKey(a.tab).localeCompare(titleSortKey(b.tab)) || a.index - b.index
  );
  for (const item of rest) ordered.push(item.tab.id);
  return ordered;
}

function orderTabsForViewing(tabs) {
  if (!tabs || !tabs.length) return [];
  if (tabs.length === 1) return [tabs[0].id];

  const byType = new Map();
  tabs.forEach((tab, index) => {
    const type = detectType(tab) || "";
    if (!byType.has(type)) {
      byType.set(type, { tabs: [], firstIndex: index });
    }
    byType.get(type).tabs.push(tab);
  });

  const blocks = [...byType.values()].sort((a, b) => {
    const size = b.tabs.length - a.tabs.length;
    if (size) return size;
    return a.firstIndex - b.firstIndex;
  });

  const ids = [];
  for (const block of blocks) ids.push(...clusterBlockByTitle(block.tabs));
  return ids;
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
  globalThis.orderTabsForViewing = orderTabsForViewing;
  globalThis.tokenize = tokenize;
  globalThis.learnPersonalWords = learnPersonalWords;
  globalThis.setPersonalWords = setPersonalWords;
}
