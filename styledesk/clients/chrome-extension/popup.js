const $ = (s) => document.querySelector(s);
let host = "";

async function show() {
  const s = await chrome.storage.local.get(["server", "token", "user", "enabled", "disabledSites", "voiceId"]);
  $("#signed-out").hidden = !!s.token;
  $("#signed-in").hidden = !s.token;
  $("#server").value = s.server || "http://localhost:8000";
  if (!s.token) return;
  $("#who").textContent = s.user?.name || "";
  $("#nr").textContent = s.user?.workspace_name || "";
  loadVoices(s);
  $("#enabled").checked = s.enabled !== false;
  $("#host").textContent = host || "this page";
  $("#site").checked = !(s.disabledSites || []).includes(host);
  $("#site").disabled = !host;
}

async function authed(path) {
  const { server, token } = await chrome.storage.local.get(["server", "token"]);
  const res = await fetch(server + path, { headers: { Authorization: "Bearer " + token } });
  if (res.status === 401) { await chrome.storage.local.remove(["token", "user"]); show(); throw new Error("signed out"); }
  return res.json();
}

async function loadVoices(s) {
  try {
    const [voices, me] = await Promise.all([authed("/api/voices"), authed("/api/me")]);
    await chrome.storage.local.set({ user: { ...s.user, ai_enabled: me.ai_enabled, workspace_name: me.workspace_name } });
    const sel = $("#voice");
    sel.innerHTML = voices.length
      ? voices.map((v) => `<option value="${v.id}">${v.name.replace(/[<&]/g, "")}${v.sample_count ? "" : " (not trained)"}</option>`).join("")
      : `<option value="">Create a voice on the website first</option>`;
    const pick = voices.find((v) => v.id === s.voiceId) || voices[0];
    if (pick) { sel.value = pick.id; await chrome.storage.local.set({ voiceId: pick.id, voiceName: pick.name }); }
  } catch {}
}

$("#voice").addEventListener("change", (e) => {
  chrome.storage.local.set({ voiceId: Number(e.target.value), voiceName: e.target.selectedOptions[0].textContent.replace(/ \(not trained\)$/, "") });
});

$("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#err").textContent = "";
  const server = $("#server").value.trim().replace(/\/$/, "");
  try {
    const res = await fetch(server + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: $("#email").value, password: $("#password").value, client: "chrome-extension" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Sign-in failed.");
    await chrome.storage.local.set({ server, token: data.token, user: data.user, enabled: true });
    show();
  } catch (err) {
    $("#err").textContent = err.message === "Failed to fetch" ? "Can't reach that server address." : err.message;
  }
});

$("#logout").addEventListener("click", async () => {
  const { server, token } = await chrome.storage.local.get(["server", "token"]);
  fetch(server + "/api/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + token } }).catch(() => {});
  await chrome.storage.local.remove(["token", "user", "voiceId", "voiceName"]);
  show();
});

$("#enabled").addEventListener("change", (e) => chrome.storage.local.set({ enabled: e.target.checked }));
$("#site").addEventListener("change", async (e) => {
  const { disabledSites = [] } = await chrome.storage.local.get("disabledSites");
  const set = new Set(disabledSites);
  e.target.checked ? set.delete(host) : set.add(host);
  await chrome.storage.local.set({ disabledSites: [...set] });
});
$("#open").addEventListener("click", async (e) => {
  e.preventDefault();
  const { server } = await chrome.storage.local.get("server");
  chrome.tabs.create({ url: server });
});

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  try { host = new URL(tab.url).hostname; } catch {}
  show();
});
