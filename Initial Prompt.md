
# Context:
Group four is a chrome tab manager using AI to manage and group based on related content
Group four should sort tabs based on their name, and the context of them. It should group them together using the chrome group, using chrome.tabs api.
# Features of the app:
1. This should be a simple one click sorter app using grok, claude, or chatgpt api keys.
2. The AI should decide what tabs should be moved together based on the context of the name of the tabs in questions
3. The AI should then generate a corresponding short succint name for that tab group
4. Give a skill.md to improve speed and quality of the grouping. Make sure it doesn't use too many tokens, because this tool is going to be used frequently.
5. Use grok api key. I can provide in a .env file.
6. An example of what would group. For example, I have plusportals, a school portal, google classroom, and gmail. These should be grouped together. Take a moment to think why. This is the kind of logic that should be used
7. Should correspond context over tab similarity. For example, If i have an essay about the joy luck club and google searches about the joy luck club, it should be prioritised to group over other docs.
# UI:
1. Ui is less imprtaint in this project. Jusr add a browser extension button in the top, that shows up once it is downloaded and configured. Nothing complicated, just whevever it is clicked it should send an api call to gpt determining the configuration, and reutrning formatted answer determining what the grouping is. Then sends an api call to chrome group api to group it accordingly.