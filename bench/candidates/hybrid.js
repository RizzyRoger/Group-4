const { finish } = require("./shared");
const { averageLinkage, similarity, features } = require("./linkage");

const THRESHOLDS = [0.001, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5];
const MAX_CONTEXT_GROUPS = 5;

function avgSim(f, cluster) {
  let total = 0;
  for (const other of cluster) total += similarity(f, other);
  return total / cluster.length;
}

function group(tabs, { threshold }) {
  const minSize = tabs.length >= 40 ? 4 : 3;
  const all = averageLinkage(tabs.map(features), threshold);
  let clusters = all.filter((cluster) => cluster.length >= minSize);
  const leftovers = all.filter((cluster) => cluster.length < minSize).flat();

  for (const f of leftovers) {
    let best = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const sameSite = f.site ? cluster.filter((other) => other.site === f.site).length : 0;
      const score = sameSite >= 2 ? 1 : avgSim(f, cluster);
      if (score > bestScore) {
        bestScore = score;
        best = cluster;
      }
    }
    if (best && bestScore >= threshold * 0.75) best.push(f);
  }

  clusters.sort((a, b) => b.length - a.length);
  clusters = clusters.slice(0, MAX_CONTEXT_GROUPS);
  return finish(tabs, clusters);
}

module.exports = {
  name: "hybrid",
  grid: THRESHOLDS.map((threshold) => ({ threshold })),
  group,
};
