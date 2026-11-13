// Talks to the Style Desk server on behalf of content scripts. Requests are made here, not in the
// page, so the newsroom token is never exposed to the websites the reporter is writing on.

async function settings() {
  return chrome.storage.local.get(["server", "token", "user", "enabled", "disabledSites"]);
}

async function call(path, body) {
  const { server, token } = await settings();
  if (!server || !token) return { error: "signed_out" };
  let res;
  try {
    res = await fetch(server.replace(/\/$/, "") + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: "offline", message: "Can't reach the Style Desk server." };
  }
  if (res.status === 401) {
    await chrome.storage.local.remove(["token", "user"]);
    return { error: "signed_out" };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: "server", message: data.detail || res.statusText };
  return { data };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "check") {
      sendResponse(await call("/api/check", { title: "", body: msg.text, use_ai: !!msg.useAi }));
    } else if (msg.type === "config") {
      const s = await settings();
      let host = "";
      try { host = new URL(sender.tab?.url || sender.url || "").hostname; } catch {}
      sendResponse({
        signedIn: !!s.token,
        enabled: s.enabled !== false && !(s.disabledSites || []).includes(host),
        server: s.server,
        newsroom: s.user?.newsroom_name,
      });
    }
  })();
  return true; // async response
});
