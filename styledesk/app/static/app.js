const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

let TOKEN = store.get("sd_token");
let ME = null;
let VOICES = [];
let VOICE_ID = Number(store.get("sd_voice")) || null;
let REPORT = null; // last check result
let CHECKED = ""; // the text that REPORT describes

// ---------- plumbing ----------
async function api(path, opts = {}) {
  const headers = {};
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (TOKEN) headers.Authorization = "Bearer " + TOKEN;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/api/auth/")) { signOutLocal(); throw new Error(data.detail || "Please sign in again."); }
  if (!res.ok) {
    const d = data.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join("; ") : res.statusText);
  }
  return data;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 4000);
}

async function busy(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try { return await fn(); } catch (e) { toast(e.message); } finally { btn.disabled = false; btn.textContent = old; }
}

function showTab(name) {
  document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
  if (name === "train") loadTrain();
  if (name === "account") loadAccount();
}
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ---------- auth ----------
let authMode = "login";
let SIGNUP_CODE_REQUIRED = false;
fetch("/api/config").then((r) => r.json()).then((c) => { SIGNUP_CODE_REQUIRED = !!c.signup_code_required; setAuthMode(authMode); }).catch(() => {});
function setAuthMode(m) {
  authMode = m;
  document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  document.querySelectorAll("#auth-form [data-show]").forEach((el) => (el.hidden = !el.dataset.show.split(" ").includes(m)));
  if (!SIGNUP_CODE_REQUIRED) $("#signup-code-field").hidden = true;
  // Only fields that are visible for this mode are required, so the browser stops an empty submit.
  const need = { register: ["name"].concat(SIGNUP_CODE_REQUIRED ? ["signup_code"] : []), join: ["name", "invite_code"], login: [] }[m];
  for (const n of ["name", "invite_code", "signup_code"]) $(`#auth-form [name=${n}]`).required = need.includes(n);
  $("#auth-submit").textContent = { login: "Sign in", join: "Join team", register: "Create account" }[m];
  $("#auth-form [name=password]").autocomplete = m === "login" ? "current-password" : "new-password";
}
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); setAuthMode(b.dataset.mode); }));
$("#auth-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy($("#auth-submit"), "One moment…", async () => {
    const f = Object.fromEntries(new FormData(e.target));
    const body = { email: f.email, password: f.password, client: "web" };
    if (authMode !== "login") body.name = f.name;
    if (authMode === "join") body.invite_code = f.invite_code;
    if (authMode === "register" && SIGNUP_CODE_REQUIRED) body.signup_code = f.signup_code;
    const r = await api(`/api/auth/${authMode}`, { method: "POST", body: JSON.stringify(body) });
    TOKEN = r.token;
    store.set("sd_token", TOKEN);
    await boot();
  });
});

function signOutLocal() {
  TOKEN = null; ME = null;
  store.set("sd_token", null);
  $("#auth").hidden = false; $("header.top").hidden = true; $("main").hidden = true;
}
$("#btn-logout").addEventListener("click", async () => { try { await api("/api/auth/logout", { method: "POST" }); } catch {} signOutLocal(); });

async function boot() {
  if (!TOKEN) return signOutLocal();
  try { ME = await api("/api/me"); } catch { return; }
  $("#auth").hidden = true; $("header.top").hidden = false; $("main").hidden = false;
  $("#ai-toggle").hidden = !ME.ai_enabled;
  $("#ai-note").hidden = ME.ai_enabled;
  $("#c-ai").checked = ME.ai_enabled;
  await loadVoices();
  const q = new URLSearchParams(location.search); // text shared to the installed app
  if (q.has("share")) {
    $("#c-title").value = q.get("title") || "";
    $("#c-text").value = q.get("text") || "";
    history.replaceState(null, "", "/");
  }
  if (!VOICES.length) showTab("train");
}

// ---------- voices ----------
async function loadVoices(selectId) {
  VOICES = await api("/api/voices");
  if (selectId) VOICE_ID = selectId;
  if (!VOICES.some((v) => v.id === VOICE_ID)) VOICE_ID = VOICES[0]?.id ?? null;
  store.set("sd_voice", VOICE_ID);
  $("#voice-select").innerHTML = VOICES.length
    ? VOICES.map((v) => `<option value="${v.id}" ${v.id === VOICE_ID ? "selected" : ""}>${esc(v.name)}${v.sample_count ? "" : " (not trained)"}</option>`).join("")
    : `<option value="">No voices yet</option>`;
  $("#voice-select").disabled = !VOICES.length;
}
const currentVoice = () => VOICES.find((v) => v.id === VOICE_ID);

$("#voice-select").addEventListener("change", (e) => {
  VOICE_ID = Number(e.target.value);
  store.set("sd_voice", VOICE_ID);
  if ($("#tab-train").classList.contains("active")) loadTrain();
  if (REPORT) { $("#report").className = "report empty"; $("#report").textContent = "Voice changed. Press Check again."; $("#rewrite").hidden = true; REPORT = null; }
});

function newVoice() {
  const d = $("#new-voice-dialog");
  $("#new-voice-form").reset();
  d.showModal();
}
$("#btn-new-voice").addEventListener("click", newVoice);
document.addEventListener("click", (e) => { if (e.target.dataset?.act === "new-voice") newVoice(); });
$("#new-voice-dialog").addEventListener("close", async () => {
  if ($("#new-voice-dialog").returnValue !== "ok") return;
  const f = Object.fromEntries(new FormData($("#new-voice-form")));
  if (!f.name?.trim()) return;
  try {
    const r = await api("/api/voices", { method: "POST", body: JSON.stringify({ name: f.name, description: f.description || "" }) });
    await loadVoices(r.id);
    showTab("train");
    toast("Voice created. Now add some of your writing.");
  } catch (e) { toast(e.message); }
});

// ---------- check ----------
const SEV_LABEL = { error: "errors", warning: "voice", suggestion: "suggestions" };

$("#btn-check").addEventListener("click", (e) => busy(e.target, "Checking…", () => runCheck($("#c-ai").checked)));

async function runCheck(useAi) {
  const text = $("#c-text").value;
  if (!VOICE_ID) { toast("Create and train a voice first."); return showTab("train"); }
  if (!text.trim()) return toast("Paste some text to check.");
  if (!currentVoice()?.sample_count) toast("This voice has no samples yet, so only your rules apply. Add writing on Train voice.");
  REPORT = await api("/api/check", { method: "POST", body: JSON.stringify({ voice_id: VOICE_ID, text, title: $("#c-title").value.trim(), use_ai: useAi }) });
  CHECKED = text;
  $("#rewrite").hidden = true;
  renderReport();
}

function pickSpans(issues) {
  const chosen = [];
  for (const it of issues.filter((i) => i.start != null).sort((a, b) => (a.end - a.start) - (b.end - b.start))) {
    if (chosen.every((c) => it.end <= c.start || it.start >= c.end)) chosen.push(it);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

function highlight(text, issues) {
  let out = "", pos = 0;
  for (const it of pickSpans(issues)) {
    out += esc(text.slice(pos, it.start));
    out += `<mark class="${it.severity}" data-id="${it.id}" title="${esc(it.message)}">${esc(text.slice(it.start, it.end))}</mark>`;
    pos = it.end;
  }
  return out + esc(text.slice(pos));
}

function scoreClass(s) { return s >= 75 ? "good" : s >= 50 ? "mid" : "low"; }

function renderReport() {
  const r = REPORT, box = $("#report");
  const c = r.counts;
  const rewritable = r.issues.filter((i) => i.rewritable);
  box.className = "report";
  box.innerHTML = `
    <div class="score ${scoreClass(r.match_score)}">
      <div class="num">${r.match_score}<span>/100</span></div>
      <div class="grow">
        <div class="label">Sounds like ${esc(r.voice.name)}</div>
        <div class="bar"><i style="width:${r.match_score}%"></i></div>
        <div class="muted">${r.match_source === "ai" ? "Scored by AI review" : "Estimate from rule-based checks"} · trained on ${r.voice.sample_count} samples (${r.voice.word_count.toLocaleString()} words)</div>
      </div>
    </div>
    ${r.ai ? `<div class="verdict">${esc(r.ai.summary)}</div>` : ""}
    ${r.ai_error ? `<div class="notice">AI review skipped: ${esc(r.ai_error)}</div>` : ""}
    ${r.differences.length ? `<h3>How this differs from your writing</h3><ul class="diffs">${r.differences.map((d) => `<li><b>${esc(d.aspect)}</b> ${esc(d.message)}</li>`).join("")}</ul>` : ""}
    <div class="summary">
      ${["error", "warning", "suggestion"].map((s) => `<span class="badge ${s}">${c[s] || 0} ${SEV_LABEL[s]}</span>`).join("")}
    </div>
    ${ME.ai_enabled && CHECKED.trim() ? `<div class="row actions">
      <button class="primary" id="btn-rw-flagged" ${rewritable.length ? "" : "disabled"}>Rewrite flagged parts in my voice</button>
      <button id="btn-rw-all">Rewrite everything</button>
      <label class="check small" title="The AI won't invent experiences. Tick this to get [notes] where your own stories or examples would make it sound like you."><input type="checkbox" id="rw-prompts"> Leave notes where my own details should go</label>
    </div>` : ""}
    <div class="story">${highlight(CHECKED, r.issues)}</div>
    <ul class="issues">${r.issues.map((it) => `
      <li data-id="${it.id}">
        <span class="sev ${it.severity}"></span>
        <div>
          <div class="cat">${esc(it.category)}<span class="src ${it.source === "ai" ? "ai" : ""}">${it.source === "ai" ? "AI" : esc(it.source)}</span></div>
          ${it.excerpt ? `<div class="ex">“${esc(it.excerpt.length > 160 ? it.excerpt.slice(0, 160) + "…" : it.excerpt)}”</div>` : ""}
          <div>${esc(it.message)}</div>
          <div class="fix">
            ${it.replacement != null && it.start != null ? `<span class="to">→ ${esc(it.replacement || "(remove)")}</span><button data-act="apply" data-id="${it.id}">Apply</button>` : ""}
            ${ME.ai_enabled && it.rewritable ? `<button data-act="rewrite-one" data-id="${it.id}">Rewrite in my voice</button>` : ""}
            <button data-act="ignore" data-id="${it.id}" class="link">Ignore</button>
          </div>
        </div>
      </li>`).join("") || `<li><span></span><div>Nothing flagged. This already sounds like you.</div></li>`}
    </ul>`;

  const focus = (id) => {
    box.querySelectorAll("mark.focus").forEach((m) => m.classList.remove("focus"));
    const m = box.querySelector(`mark[data-id="${id}"]`);
    if (m) { m.classList.add("focus"); m.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  };
  box.querySelectorAll(".issues li[data-id]").forEach((li) => li.addEventListener("click", (e) => { if (!e.target.closest("button")) focus(li.dataset.id); }));
  box.querySelectorAll("mark").forEach((m) => m.addEventListener("click", () => box.querySelector(`.issues li[data-id="${m.dataset.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })));
  box.querySelectorAll("button[data-act]").forEach((b) => b.addEventListener("click", () => issueAction(b)));
  $("#btn-rw-flagged")?.addEventListener("click", (e) => busy(e.target, "Rewriting…", () =>
    doRewrite({ mode: "spans", spans: REPORT.issues.filter((i) => i.rewritable).map(spanOf) })));
  $("#btn-rw-all")?.addEventListener("click", (e) => busy(e.target, "Rewriting…", () => doRewrite({ mode: "all" })));
}

const spanOf = (it) => ({ start: it.start, end: it.end, reason: `${it.category}: ${it.message}` });

function textUnchanged() {
  if ($("#c-text").value === CHECKED) return true;
  toast("The text changed since the check. Press Check again first.");
  return false;
}

function issueAction(b) {
  const it = REPORT.issues.find((x) => String(x.id) === b.dataset.id);
  if (!it) return;
  if (b.dataset.act === "ignore") {
    REPORT.issues = REPORT.issues.filter((x) => x !== it);
    REPORT.counts[it.severity]--;
    return renderReport();
  }
  if (!textUnchanged()) return;
  if (b.dataset.act === "apply") {
    const text = CHECKED.slice(0, it.start) + it.replacement + CHECKED.slice(it.end);
    shiftAfterEdit(it, it.replacement.length - (it.end - it.start));
    $("#c-text").value = CHECKED = text;
    REPORT.counts[it.severity]--;
    return renderReport();
  }
  if (b.dataset.act === "rewrite-one") busy(b, "Rewriting…", () => doRewrite({ mode: "spans", spans: [spanOf(it)] }));
}

function shiftAfterEdit(it, delta) {
  REPORT.issues = REPORT.issues
    .filter((x) => x !== it && !(x.start != null && x.start < it.end && x.end > it.start && x.end - x.start <= it.end - it.start + 40))
    .map((x) => {
      if (x.start == null) return x;
      if (x.start >= it.end) return { ...x, start: x.start + delta, end: x.end + delta };
      if (x.end >= it.end) return { ...x, end: x.end + delta }; // a longer span containing the edit
      return x;
    });
}

// ---------- rewrite ----------
async function doRewrite({ mode, spans, add_prompts = false }) {
  if (!textUnchanged()) return;
  if (CHECKED.length > 30000) return toast("Rewriting works on up to 30,000 characters at a time.");
  const r = await api("/api/rewrite", { method: "POST", body: JSON.stringify({ voice_id: VOICE_ID, text: CHECKED, mode, spans, add_prompts }) });
  if (mode === "spans" && !r.changes.length) return toast("Nothing needed rewriting.");
  showRewrite(r, mode);
}

function showRewrite(r, mode) {
  const box = $("#rewrite");
  let html = "";
  if (mode === "all") html = esc(r.text).replace(/\[[^\]\n]{3,200}\]/g, (m) => `<mark class="fill-in">${m}</mark>`);
  else {
    let pos = 0;
    for (const ch of r.changes) {
      html += esc(r.text.slice(pos, ch.start)) + `<ins title="Was: ${esc(ch.original)}">${esc(r.text.slice(ch.start, ch.end))}</ins>`;
      pos = ch.end;
    }
    html += esc(r.text.slice(pos));
  }
  box.hidden = false;
  box.innerHTML = `
    <h3>Rewritten in your voice</h3>
    <p class="muted">${mode === "all" ? (/\[[^\]\n]{3,200}\]/.test(r.text) ? "The whole text, rewritten. Fill in the highlighted [notes] with your own details. The AI doesn't invent experiences." : "The whole text, rewritten.") : `${r.changes.length} part${r.changes.length === 1 ? "" : "s"} rewritten (highlighted). Hover to see the original.`} Facts, names and quotes are kept.</p>
    <div class="story">${html}</div>
    ${mode === "spans" ? `<details><summary>Show changes side by side</summary><ul class="changes">${r.changes.map((c) => `<li><del>${esc(c.original)}</del><ins>${esc(c.rewrite)}</ins></li>`).join("")}</ul></details>` : ""}
    <div class="row actions">
      <button class="primary" id="rw-use">Use this version</button>
      <button id="rw-copy">Copy</button>
      <span class="grow"></span>
      <button id="rw-discard" class="link">Discard</button>
    </div>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#rw-use").addEventListener("click", (e) => busy(e.target, "Checking…", async () => {
    $("#c-text").value = r.text;
    box.hidden = true;
    $("#report").className = "report empty";
    $("#report").textContent = "Checking the new version\u2026";
    await runCheck(false);
    toast("Updated. Run a deep check again to re-score with AI.");
  }));
  $("#rw-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(r.text); toast("Copied."); } catch { toast("Couldn't copy. Select the text and copy it instead."); }
  });
  $("#rw-discard").addEventListener("click", () => { box.hidden = true; });
}

// ---------- train ----------
const FP_CARDS = [
  ["sentence_words_avg", "Words per sentence", (v) => v],
  ["reading_ease", "Reading ease (0-100, higher = easier)", (v) => v],
  ["contractions_per_100w", "Contractions per 100 words", (v) => v],
  ["first_person_per_100w", "First person (I, my, we) per 100 words", (v) => v],
  ["questions_per_1kw", "Questions per 1,000 words", (v) => v],
  ["exclamations_per_1kw", "Exclamation marks per 1,000 words", (v) => v],
  ["em_dashes_per_1kw", "Dashes per 1,000 words", (v) => v],
  ["vocabulary_variety", "Vocabulary variety", (v) => `${Math.round(v * 100)}%`],
];

async function loadTrain() {
  const hasVoice = !!VOICE_ID;
  $("#train-empty").hidden = hasVoice;
  $("#train-body").hidden = !hasVoice;
  if (!hasVoice) return;
  const [v, samples, rules] = await Promise.all([
    api(`/api/voices/${VOICE_ID}`), api(`/api/voices/${VOICE_ID}/samples`), api(`/api/voices/${VOICE_ID}/rules`),
  ]);
  $("#v-name").value = v.name;
  $("#v-desc").value = v.description;
  document.querySelectorAll("#train-body input, #train-body textarea, #train-body button, #train-body select").forEach((el) => (el.disabled = !v.can_edit));
  $("#btn-learn").hidden = !ME.ai_enabled;

  $("#samples").innerHTML = samples.map((s) => `
    <li><div class="grow"><div class="title">${esc(s.title || s.preview.slice(0, 60) + "…")}</div><div class="muted">${s.chars.toLocaleString()} characters</div></div>
    ${v.can_edit ? `<button data-del-sample="${s.id}">Remove</button>` : ""}</li>`).join("") || `<li class="muted">No samples yet.</li>`;
  $("#rules").innerHTML = rules.map((r) => `
    <li><div class="grow"><b>${{ prefer: "Prefer", ban: "Never use", note: "Note" }[r.kind]}</b> ${r.term ? `“${esc(r.term)}”` : ""} ${r.replacement ? `→ “${esc(r.replacement)}”` : ""} <span class="muted">${esc(r.reason || "")}</span></div>
    ${v.can_edit ? `<button data-del-rule="${r.id}">Remove</button>` : ""}</li>`).join("") || `<li class="muted">No rules yet.</li>`;

  const st = v.stats;
  if (!st) {
    $("#stats").innerHTML = `<p class="muted">Add some of your writing to see your style fingerprint.</p>`;
  } else {
    const strength = st.word_count >= 1000 ? ["good", "Well trained"] : st.word_count >= 300 ? ["mid", "Trained, and more writing will help"] : ["low", "Needs more writing (at least 300 words)"];
    const fp = st.fingerprint || {};
    const cards = FP_CARDS.map(([k, label, f]) => `<div class="stat"><div class="k">${label}</div><div class="v">${f(fp[k] ?? 0)}</div></div>`);
    cards.push(...Object.values(st.preferences).map((p) => `<div class="stat"><div class="k">${esc(p.label)}</div><div class="v">${esc(p.preferred)} <span class="muted">(${Math.round(p.share * 100)}%)</span></div></div>`));
    $("#stats").innerHTML = `
      <p><span class="pill ${strength[0]}">${strength[1]}</span> <span class="muted">${st.sample_count} samples, ${st.word_count.toLocaleString()} words</span></p>
      <div class="stats">${cards.join("")}</div>`;
  }

  const p = v.profile;
  $("#profile").innerHTML = p ? `
    <p>${esc(p.summary)}</p>
    <div class="chips">${p.tone.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
    ${p.traits.map((t) => `<div class="trait"><div class="cat">${esc(t.aspect)}</div><div>${esc(t.description)}</div><div class="eg">“${esc(t.example)}”</div></div>`).join("")}
    ${p.signature_phrases.length ? `<h3>Phrases you use</h3><div class="chips">${p.signature_phrases.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
    ${p.never_does.length ? `<h3>Doesn't sound like you</h3><ul class="plain">${p.never_does.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    <p class="muted">Learned ${esc((v.profile_updated_at || "").replace("T", " ").slice(0, 16))} UTC. Learn again after adding more writing.</p>`
    : ME.ai_enabled
      ? `<p class="muted">Not learned yet. After adding your writing, press <b>Learn my voice with AI</b>. The AI reads your samples and describes your tone, rhythm and word choice. That description is used to judge and rewrite text.</p>`
      : `<p class="muted">AI isn't set up on this server, so your voice is judged on the measurable fingerprint and your rules.</p>`;
}

$("#btn-save-voice").addEventListener("click", (e) => busy(e.target, "Saving…", async () => {
  await api(`/api/voices/${VOICE_ID}`, { method: "PATCH", body: JSON.stringify({ name: $("#v-name").value, description: $("#v-desc").value }) });
  await loadVoices();
  toast("Saved.");
}));

$("#btn-delete-voice").addEventListener("click", async () => {
  const v = currentVoice();
  if (!v || !confirm(`Delete the voice “${v.name}” and all its samples? This can't be undone.`)) return;
  try { await api(`/api/voices/${VOICE_ID}`, { method: "DELETE" }); await loadVoices(); loadTrain(); toast("Voice deleted."); } catch (e) { toast(e.message); }
});

document.addEventListener("click", async (e) => {
  const s = e.target.dataset?.delSample, r = e.target.dataset?.delRule;
  try {
    if (s) { await api(`/api/voices/${VOICE_ID}/samples/${s}`, { method: "DELETE" }); await loadVoices(); loadTrain(); }
    if (r) { await api(`/api/voices/${VOICE_ID}/rules/${r}`, { method: "DELETE" }); loadTrain(); }
  } catch (err) { toast(err.message); }
});

$("#btn-upload").addEventListener("click", (e) => busy(e.target, "Uploading…", async () => {
  const files = $("#s-files").files;
  if (!files.length) return toast("Choose one or more .txt or .md files.");
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const r = await api(`/api/voices/${VOICE_ID}/samples/upload`, { method: "POST", body: fd });
  $("#s-files").value = "";
  toast(`Added ${r.added} samples.`);
  await loadVoices(); loadTrain();
}));

$("#btn-add-sample").addEventListener("click", (e) => busy(e.target, "Adding…", async () => {
  const pieces = $("#s-body").value.split(/^\s*---\s*$/m).map((x) => x.trim()).filter(Boolean);
  if (!pieces.length) return toast("Paste some of your writing.");
  await api(`/api/voices/${VOICE_ID}/samples`, { method: "POST", body: JSON.stringify(pieces.map((body) => ({ title: "", body }))) });
  $("#s-body").value = "";
  toast(`Added ${pieces.length} sample${pieces.length === 1 ? "" : "s"}.`);
  await loadVoices(); loadTrain();
}));

$("#btn-add-rule").addEventListener("click", (e) => busy(e.target, "Adding…", async () => {
  await api(`/api/voices/${VOICE_ID}/rules`, { method: "POST", body: JSON.stringify({
    kind: $("#r-kind").value, term: $("#r-term").value, replacement: $("#r-repl").value, reason: $("#r-reason").value,
  }) });
  ["#r-term", "#r-repl", "#r-reason"].forEach((s) => ($(s).value = ""));
  loadTrain();
}));

$("#r-kind").addEventListener("change", () => {
  const k = $("#r-kind").value;
  $("#r-term").hidden = $("#r-repl").hidden = k === "note";
  $("#r-repl").hidden = k === "note";
  $("#r-repl").placeholder = k === "ban" ? "Suggest instead (optional)" : "Use instead (e.g. use)";
  $("#r-reason").placeholder = k === "note" ? "e.g. I never start emails with “I hope this finds you well”" : "Why (optional)";
});

$("#btn-learn").addEventListener("click", (e) => busy(e.target, "Reading your writing…", async () => {
  const r = await api(`/api/voices/${VOICE_ID}/learn`, { method: "POST" });
  toast(`Voice learned from ${r.samples_used} samples.`);
  await loadVoices(); loadTrain();
}));

// ---------- account ----------
async function loadAccount() {
  ME = await api("/api/me");
  $("#acct-name").textContent = ME.name;
  $("#acct-email").textContent = ME.email + (ME.ai_enabled && ME.ai_daily_limit ? ` \u00b7 AI used today: ${ME.ai_used_today} of ${ME.ai_daily_limit}` : "");
  const isOwner = ME.role === "owner";
  $("#ws-name").value = ME.workspace_name;
  $("#ws-rename").hidden = !isOwner;
  $("#invite-box").hidden = !isOwner;
  $("#ws-explain").textContent = isOwner
    ? "Voices live in a workspace. Invite others to share them, for example a newsroom or a team that writes in one house style."
    : `You're a member of ${ME.workspace_name}. You can use every voice here, and edit the ones you create.`;
  if (isOwner) $("#invite-code").textContent = ME.invite_code;
  $("#server-url").textContent = location.origin;
  $("#members").innerHTML = ME.members.map((m) => `<li><div class="grow"><b>${esc(m.name)}</b> <span class="muted">${esc(m.email)}</span></div><span class="status">${esc(m.role)}</span></li>`).join("");
}
$("#btn-ws-save").addEventListener("click", (e) => busy(e.target, "Saving…", async () => {
  await api("/api/workspace", { method: "PATCH", body: JSON.stringify({ name: $("#ws-name").value }) });
  toast("Workspace renamed.");
}));
$("#btn-rotate").addEventListener("click", (e) => busy(e.target, "…", async () => {
  const r = await api("/api/workspace/invite/rotate", { method: "POST" });
  $("#invite-code").textContent = r.invite_code;
  toast("New invite code created. The old one no longer works.");
}));

setAuthMode("login");
boot();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
