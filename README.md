# Group Four

One-click Chrome extension that groups tabs in the current window from their titles. No API key. Right-click the toolbar icon to switch grouping mode.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Pin **Group Four** to the toolbar.

## How grouping works

Titles (and hostnames) are split on spaces, hyphens, and other connectors. Common words (`the`, `google`, `search`, …) are ignored. Tabs that share a distinctive word (`e30`), two terms in any order (`homework 24` / `24 homework`), or a known association (School: Classroom, PlusPortals, Gmail) go in the same group, named after the repeated item. Leftovers are then grouped by type (Docs, Gmail, YouTube); anything still ungrouped goes into **Misc**.

## Use

Click the toolbar icon to group tabs in the current window, or press **Alt+Shift+G**. Right-click the icon and choose **Grouping mode**:

- **Only ungrouped tabs** (default) — leave existing groups alone
- **Regroup all tabs** — ungroup the window, then group from scratch
- **Keep and adjust groups** — keep groups that still make sense; add or create as needed

Pinned tabs and `chrome://` pages are skipped. While grouping, the toolbar icon rotates its square colors clockwise. When it finishes, the icon border is green (done), red (error), or grey (nothing to group), then the normal icon returns.
