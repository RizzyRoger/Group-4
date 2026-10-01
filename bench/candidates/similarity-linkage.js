const { finish } = require("./shared");
const { averageLinkage, features } = require("./linkage");

const THRESHOLDS = [0.001, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5];
const MIN_SIZES = [2, 3, 4];

function group(tabs, { threshold, minSize }) {
  const clusters = averageLinkage(tabs.map(features), threshold).filter(
    (cluster) => cluster.length >= minSize
  );
  return finish(tabs, clusters);
}

module.exports = {
  name: "similarity-linkage",
  grid: THRESHOLDS.flatMap((threshold) => MIN_SIZES.map((minSize) => ({ threshold, minSize }))),
  group,
};
