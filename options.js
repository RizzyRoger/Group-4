const DEFAULT_MODEL = "grok-4-fast";

async function load() {
  const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
  document.getElementById("apiKey").value = apiKey || "";
  document.getElementById("model").value = model || "";
  document.getElementById("model").placeholder = DEFAULT_MODEL;
}

document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKey = document.getElementById("apiKey").value.trim();
  const model = document.getElementById("model").value.trim();
  await chrome.storage.local.set({
    apiKey,
    model: model || DEFAULT_MODEL,
  });
  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
});

load();
