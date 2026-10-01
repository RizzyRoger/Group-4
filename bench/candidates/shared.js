const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadGroupJs() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "group.js"), "utf8");
  vm.runInNewContext(source, sandbox);
  return sandbox;
}

const G = loadGroupJs();

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function withHost(tabs) {
  return tabs.map((tab) => ({ ...tab, host: tab.host || hostOf(tab.url) }));
}

const features = G.linkFeatures;
const overlap = G.intersectionSize;
const jaccard = G.jaccard;

function nameCluster(members) {
  return G.nameCluster(members, new Set());
}

function leftoverGroups(tabs) {
  return G.typeAndMiscGroups(tabs).map((group) => ({ name: group.name, ids: [...group.ids] }));
}

function finish(tabs, clusters) {
  const used = new Set(clusters.flatMap((cluster) => cluster.map((f) => f.id)));
  const groups = clusters.map((cluster) => ({
    name: nameCluster(cluster),
    ids: cluster.map((f) => f.id),
  }));
  return groups.concat(leftoverGroups(tabs.filter((tab) => !used.has(tab.id))));
}

module.exports = {
  G,
  withHost,
  features,
  overlap,
  jaccard,
  nameCluster,
  leftoverGroups,
  finish,
};
