# Group Four
One click Chrome extension for grouping tabs.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Pin **Group Four** to the toolbar for one click access.

## How grouping works

Words that carry context are identified, if they repeat then they will be grouped into tab groups. Groups are named after repeating context words, with counts, and collapse except the group that holds the active tab. Common words are ignored and the rest are grouped into tab types. Leftovers go to misc. Inside a group, tabs are ordered by type (largest block first) and then by similar titles.


## Use

Click the toolbar icon to group tabs in the current window, or press **Alt/Control+Shift+G**. Right-click the icon and choose **Grouping mode**:

- **Only ungrouped tabs** (default) — leave existing groups alone
- **Regroup all tabs** — group from scratch
- **Keep and adjust groups** — keep groups

Pinned tabs skipped
Border color of the icon shows green if it works, red if something failed, and grey if there are no tabs to group.
