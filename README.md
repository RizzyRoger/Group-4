# Group Four
One click Chrome extension for grouping tabs.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the folder named **Group Four** (or **Group-4-main** if you unzipped the GitHub download) that contains `manifest.json`.
4. Do not pick the `.zip`, `Downloads`, `icons`, or a parent folder such as `Projects` or `Obsidian Vault` — Chrome will say the manifest is missing.
5. If an old Group Four card already shows that error, **Remove** it, then load the folder above.
6. Pin **Group Four** to the toolbar for one click access.

## How grouping works

Each tab is compared with every other tab by shared title words, the same site, and a shared topic (School, Coding, Hackathon, Comics, and so on). Known sites count toward a topic even when titles share no words, so PlusPortals, Classroom and Pearson tabs land together. The most similar tabs are joined step by step, and any set of 3 or more becomes a group, named after its topic or most common word, with counts. Groups collapse except the one that holds the active tab. Leftovers are sorted into tab types (Docs, Gmail, YouTube) and the rest go to Misc. Inside a group, tabs are ordered by type (largest block first) and then by similar titles.

Common words, error-page words like "Access Denied", and your own name are ignored. Your name is learned locally from email addresses in open tab titles and saved in the extension's storage. Everything runs on your computer.

`node bench/run.js` scores the sorter against hand-made reference groupings in `bench/fixtures/`. Known weak spot: a window of unrelated entertainment tabs can still be merged into one group.


## Use

Click the toolbar icon to group tabs in the current window, or press **Alt/Control+Shift+G**. Right-click the icon and choose **Grouping mode**:

- **Only ungrouped tabs** (default) — leave existing groups alone
- **Regroup all tabs** — group from scratch
- **Keep and adjust groups** — keep groups

Pinned tabs skipped
Border color of the icon shows green if it works, red if something failed, and grey if there are no tabs to group.
