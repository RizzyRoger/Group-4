const fs = require("fs");
const path = require("path");
const { G, withHost } = require("./candidates/shared");
const { WEIGHTS, scoreFixture, aggregate, validateReference } = require("./score");

const CANDIDATES = [
  require("./candidates/current"),
  require("./candidates/host-first"),
  require("./candidates/similarity-linkage"),
  require("./candidates/hybrid"),
];

function loadFixtures(dir, source) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      return { ...data, file, source, tabs: withHost(data.tabs) };
    });
}

function paramLabel(params) {
  const entries = Object.entries(params);
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(" ") : "-";
}

function pct(x) {
  return `${(x * 100).toFixed(0)}%`;
}

function num(x) {
  return x.toFixed(3);
}

function pad(text, width) {
  const s = String(text);
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

function printTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i]).length)));
  console.log(headers.map((h, i) => pad(h, widths[i])).join("  "));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(row.map((cell, i) => pad(cell, widths[i])).join("  "));
}

function runAll(fixtures) {
  const runs = [];
  for (const candidate of CANDIDATES) {
    for (const params of candidate.grid) {
      const perFixture = fixtures.map((fixture) => {
        const groups = candidate.group(fixture.tabs, params);
        return { fixture, groups, result: scoreFixture(fixture, groups) };
      });
      runs.push({
        candidate: candidate.name,
        params,
        perFixture,
        summary: aggregate(perFixture.map((p) => p.result)),
      });
    }
  }
  return runs;
}

function summaryRow(run) {
  const s = run.summary;
  return [
    run.candidate,
    paramLabel(run.params),
    num(s.score),
    num(s.f1),
    num(s.precision),
    num(s.recall),
    pct(s.fragmentation),
    `${s.groups.toFixed(1)} / ${s.refGroups.toFixed(1)}`,
    pct(s.miscShare),
  ];
}

const SUMMARY_HEADERS = ["candidate", "params", "score", "F1", "prec", "recall", "frag", "groups/ref", "misc"];

function bestPerFamily(runs) {
  const best = new Map();
  for (const run of runs) {
    const current = best.get(run.candidate);
    if (!current || run.summary.score > current.summary.score) best.set(run.candidate, run);
  }
  return CANDIDATES.map((c) => best.get(c.name)).filter(Boolean);
}

function describeGroups(fixture, groups) {
  const byId = new Map(fixture.tabs.map((tab) => [tab.id, tab]));
  return groups
    .filter((group) => group.ids.length)
    .map((group) => {
      const titles = group.ids
        .slice(0, 3)
        .map((id) => (byId.get(id)?.title || "").split(/ [-|:] /)[0].slice(0, 26));
      const more = group.ids.length > 3 ? ", ..." : "";
      return `    ${group.name} (${group.ids.length}): ${titles.join(", ")}${more}`;
    })
    .join("\n");
}

function printDisagreements(fixtures, families, count) {
  const spread = fixtures.map((fixture, index) => {
    const f1s = families.map((run) => run.perFixture[index].result.f1);
    return { fixture, index, spread: Math.max(...f1s) - Math.min(...f1s) };
  });
  spread.sort((a, b) => b.spread - a.spread);
  for (const { fixture, index, spread: gap } of spread.slice(0, count)) {
    console.log(`\n### ${fixture.name} (${fixture.tabs.length} tabs, F1 spread ${num(gap)})`);
    console.log("  reference:");
    console.log(describeGroups(fixture, fixture.reference));
    for (const run of families) {
      const { groups, result } = run.perFixture[index];
      console.log(`  ${run.candidate} ${paramLabel(run.params)}  score ${num(result.score)}  F1 ${num(result.f1)}:`);
      console.log(describeGroups(fixture, groups));
    }
  }
}

function report(title, fixtures) {
  console.log(`\n## ${title}: ${fixtures.length} windows, ${fixtures.reduce((n, f) => n + f.tabs.length, 0)} tabs`);
  const personal = G.learnPersonalWords(fixtures.flatMap((fixture) => fixture.tabs.map((tab) => tab.title)));
  G.setPersonalWords(personal);
  if (personal.length) console.log(`Ignoring personal words: ${personal.join(", ")}`);
  const runs = runAll(fixtures);
  runs.sort((a, b) => b.summary.score - a.summary.score);

  console.log("\nTop configurations:");
  printTable(SUMMARY_HEADERS, runs.slice(0, 12).map(summaryRow));

  const families = bestPerFamily(runs);
  console.log("\nBest configuration of each candidate:");
  printTable(SUMMARY_HEADERS, families.map(summaryRow));

  console.log("\nPer-window score (best configuration of each candidate):");
  printTable(
    ["window", ...families.map((run) => run.candidate)],
    fixtures.map((fixture, i) => [
      fixture.name,
      ...families.map((run) => {
        const r = run.perFixture[i].result;
        return `${num(r.score)} (${r.groups}/${r.refGroups})`;
      }),
    ])
  );

  console.log("\nWindows where candidates disagree most:");
  printDisagreements(fixtures, families, 3);
}

function main() {
  const root = path.join(__dirname, "fixtures");
  const synthetic = loadFixtures(path.join(root, "synthetic"), "synthetic");
  const real = loadFixtures(path.join(root, "real"), "real");

  for (const fixture of [...synthetic, ...real]) {
    if (!fixture.reference) continue;
    const problems = validateReference(fixture);
    if (problems.length) {
      console.error(`Invalid reference in ${fixture.source}/${fixture.file}:\n  ${problems.join("\n  ")}`);
      process.exitCode = 1;
      return;
    }
  }

  console.log(
    `score = F1 - ${WEIGHTS.fragmentation} * fragmentation - ${WEIGHTS.countGap} * countGap` +
      "  (frag = share of tabs in named groups of 2 or fewer; countGap = |groups - ref| / ref; Misc is not a group)"
  );

  report("Synthetic", synthetic);

  const realScored = real.filter((fixture) => fixture.reference);
  const realPending = real.filter((fixture) => !fixture.reference);
  if (realScored.length) report("Real", realScored);
  if (realPending.length) {
    console.log(`\n${realPending.length} real window(s) waiting for reference groupings:`);
    for (const fixture of realPending) console.log(`  ${fixture.file} (${fixture.tabs.length} tabs)`);
  }
  if (!real.length) {
    console.log("\nNo real windows yet. Export one with bench/export-window.js into bench/fixtures/real/.");
  }
}

main();
