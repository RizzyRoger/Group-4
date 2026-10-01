const { features, overlap, finish } = require("./shared");

function group(tabs, { minSize }) {
  const feats = tabs.map(features);
  const units = [];
  const bySite = new Map();
  for (const f of feats) {
    if (!f.site) {
      units.push([f]);
      continue;
    }
    if (!bySite.has(f.site)) {
      bySite.set(f.site, []);
      units.push(bySite.get(f.site));
    }
    bySite.get(f.site).push(f);
  }

  const parent = units.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const tokensOf = units.map((unit) => new Set(unit.flatMap((f) => [...f.tokens])));
  const topicsOf = units.map((unit) => new Set(unit.flatMap((f) => [...f.topics])));
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      if (overlap(topicsOf[i], topicsOf[j]) > 0 || overlap(tokensOf[i], tokensOf[j]) >= 2) {
        parent[find(i)] = find(j);
      }
    }
  }

  const merged = new Map();
  units.forEach((unit, i) => {
    const root = find(i);
    if (!merged.has(root)) merged.set(root, []);
    merged.get(root).push(...unit);
  });
  const clusters = [...merged.values()].filter((cluster) => cluster.length >= minSize);
  return finish(tabs, clusters);
}

module.exports = {
  name: "host-first",
  grid: [{ minSize: 2 }, { minSize: 3 }, { minSize: 4 }],
  group,
};
