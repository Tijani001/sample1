// Talks to the Style Desk server on behalf of content scripts. Requests are made here, not in the
// page, so the user's token is never exposed to the websites they are writing on.

async function settings() {
  return chrome.storage.local.get(["server", "token", "user", "enabled", "disabledSites", "voiceId", "voiceName"]);
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
      const { voiceId } = await settings();
      if (!voiceId) return sendResponse({ error: "no_voice" });
      sendResponse(await call("/api/check", { voice_id: voiceId, text: msg.text, use_ai: !!msg.useAi }));
    } else if (msg.type === "rewrite") {
      const { voiceId } = await settings();
      sendResponse(await call("/api/rewrite", { voice_id: voiceId, text: msg.text, mode: "spans", spans: msg.spans }));
    } else if (msg.type === "config") {
      const s = await settings();
      let host = "";
      try { host = new URL(sender.tab?.url || sender.url || "").hostname; } catch {}
      sendResponse({
        signedIn: !!s.token,
        enabled: s.enabled !== false && !(s.disabledSites || []).includes(host),
        server: s.server,
        voiceName: s.voiceName,
        aiEnabled: !!s.user?.ai_enabled,
      });
    }
  })();
  return true; // async response
});
