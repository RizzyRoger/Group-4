const WEIGHTS = { fragmentation: 0.5, countGap: 0.3 };
const SMALL_GROUP_MAX = 2;

function isMisc(group) {
  return String(group.name || "").trim() === "Misc";
}

function namedGroups(groups, validIds) {
  const seen = new Set();
  const named = [];
  for (const group of groups) {
    if (isMisc(group)) continue;
    const ids = group.ids.filter((id) => validIds.has(id) && !seen.has(id));
    for (const id of ids) seen.add(id);
    if (ids.length) named.push(ids);
  }
  return named;
}

function pairSet(named) {
  const pairs = new Set();
  for (const ids of named) {
    const sorted = [...ids].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) pairs.add(`${sorted[i]}|${sorted[j]}`);
    }
  }
  return pairs;
}

function pairF1(candidateNamed, referenceNamed) {
  const c = pairSet(candidateNamed);
  const r = pairSet(referenceNamed);
  let tp = 0;
  for (const pair of c) if (r.has(pair)) tp += 1;
  const precision = c.size ? tp / c.size : 1;
  const recall = r.size ? tp / r.size : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

function scoreFixture(fixture, candidateGroups) {
  const validIds = new Set(fixture.tabs.map((tab) => tab.id));
  const total = validIds.size;
  const cand = namedGroups(candidateGroups, validIds);
  const ref = namedGroups(fixture.reference, validIds);
  const { precision, recall, f1 } = pairF1(cand, ref);

  const smallTabs = cand
    .filter((ids) => ids.length <= SMALL_GROUP_MAX)
    .reduce((n, ids) => n + ids.length, 0);
  const fragmentation = total ? smallTabs / total : 0;
  const countGap = Math.abs(cand.length - ref.length) / Math.max(1, ref.length);
  const grouped = cand.reduce((n, ids) => n + ids.length, 0);
  const miscShare = total ? (total - grouped) / total : 0;

  const score = f1 - WEIGHTS.fragmentation * fragmentation - WEIGHTS.countGap * countGap;
  return {
    score,
    f1,
    precision,
    recall,
    fragmentation,
    countGap,
    groups: cand.length,
    refGroups: ref.length,
    miscShare,
  };
}

function mean(results, key) {
  if (!results.length) return 0;
  return results.reduce((n, r) => n + r[key], 0) / results.length;
}

function aggregate(results) {
  const keys = [
    "score",
    "f1",
    "precision",
    "recall",
    "fragmentation",
    "countGap",
    "groups",
    "refGroups",
    "miscShare",
  ];
  return Object.fromEntries(keys.map((key) => [key, mean(results, key)]));
}

function validateReference(fixture) {
  const ids = fixture.tabs.map((tab) => tab.id);
  const counts = new Map(ids.map((id) => [id, 0]));
  const problems = [];
  for (const group of fixture.reference || []) {
    for (const id of group.ids) {
      if (!counts.has(id)) problems.push(`unknown id ${id} in ${group.name}`);
      else counts.set(id, counts.get(id) + 1);
    }
  }
  for (const [id, n] of counts) {
    if (n === 0) problems.push(`id ${id} missing from reference`);
    if (n > 1) problems.push(`id ${id} in ${n} reference groups`);
  }
  return problems;
}

module.exports = { WEIGHTS, scoreFixture, aggregate, pairF1, namedGroups, validateReference };
