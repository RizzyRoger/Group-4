# Group Four

One-click Chrome extension that groups tabs in the current window with Grok. Right-click the toolbar icon to switch grouping mode.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Pin **Group Four** to the toolbar.

## API key

Chrome extensions cannot read a `.env` file. Paste your xAI key in the options page:

1. On `chrome://extensions`, click **Details** → **Extension options**, or right-click the toolbar icon → **Options**.
2. Paste your `XAI_API_KEY` from [console.x.ai](https://console.x.ai).
3. Save.

Optional: override the model (default `grok-4-fast`, falls back to `grok-4.6`).

## Use

Click the toolbar icon to group tabs in the current window. Right-click the icon and choose **Grouping mode**:

- **Only ungrouped tabs** (default) — leave existing groups alone
- **Regroup all tabs** — ungroup the window, then group from scratch
- **Keep and adjust groups** — keep groups that still make sense; add or create as needed

Pinned tabs and `chrome://` pages are skipped. The toolbar icon rotates its square colors while grouping.

Badge: `...` working, `OK` done, `!` error, `-` nothing to group.
