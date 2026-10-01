const { G } = require("./shared");

module.exports = {
  name: "current",
  grid: [{}],
  group(tabs) {
    return G.clusterTabs(tabs).map((group) => ({ name: group.name, ids: [...group.ids] }));
  },
};
