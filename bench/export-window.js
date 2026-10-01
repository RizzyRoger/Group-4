// Export a Chrome window as a benchmark fixture.
//
// 1. Click into the window you want to export.
// 2. Open chrome://extensions, find Group Four, click "Inspect views: service worker".
// 3. Paste the line below into that console and press Enter. It logs the tab count and
//    copies the JSON to the clipboard.
// 4. Save it as bench/fixtures/real/<name>.json (that folder is gitignored).
//    Reference groupings get added to the file afterwards.

copy(JSON.stringify(await (async () => { const w = await chrome.windows.getLastFocused({ windowTypes: ["normal"] }); const tabs = (await chrome.tabs.query({ windowId: w.id })).filter((t) => !t.pinned && !/^(chrome|chrome-extension|about|edge|devtools):/.test(t.url || "")).map((t, i) => ({ id: i + 1, title: t.title || "", url: t.url || "" })); console.log(`Copied ${tabs.length} tabs`); return { name: "Real window", tabs }; })(), null, 2));
