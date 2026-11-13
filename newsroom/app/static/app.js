const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)) : res.statusText);
  return data;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 3500);
}

async function busy(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try { return await fn(); } catch (e) { toast(e.message); } finally { btn.disabled = false; btn.textContent = old; }
}

// ---------- tabs ----------
document.querySelectorAll("nav button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
    if (b.dataset.tab === "queue") loadQueue();
    if (b.dataset.tab === "style") loadStyle();
  })
);

async function loadStatus() {
  const s = await api("/api/status");
  const el = $("#ai-status");
  el.textContent = s.ai_enabled ? `AI review on · ${s.article_count} archive articles` : `AI off (no API key) · ${s.article_count} archive articles`;
  el.classList.toggle("on", s.ai_enabled);
  if (!s.ai_enabled) $("#s-ai").checked = false;
}

// ---------- report rendering ----------
function highlight(body, issues) {
  // Prefer short, specific spans (a word or phrase) over sentence/paragraph-level notes;
  // anything that would overlap a chosen span is still listed below, just not highlighted.
  const chosen = [];
  for (const it of issues.filter((i) => i.start != null).sort((a, b) => (a.end - a.start) - (b.end - b.start))) {
    if (chosen.every((c) => it.end <= c.start || it.start >= c.end)) chosen.push(it);
  }
  const spans = chosen.sort((a, b) => a.start - b.start);
  let out = "", pos = 0;
  for (const it of spans) {
    out += esc(body.slice(pos, it.start));
    out += `<mark class="${it.severity}" data-id="${it.id}" title="${esc(it.message)}">${esc(body.slice(it.start, it.end))}</mark>`;
    pos = it.end;
  }
  return out + esc(body.slice(pos));
}

function renderReport(container, title, body, report, { editable = false } = {}) {
  const c = report.counts || {};
  const learned = report.learned_from
    ? `Compared with ${report.learned_from} archive articles.`
    : "No archive yet: add published articles on the Style guide tab so it can learn your style.";
  container.className = "report";
  container.innerHTML = `
    <div class="summary">
      <span class="badge error">${c.error || 0} errors</span>
      <span class="badge warning">${c.warning || 0} style</span>
      <span class="badge suggestion">${c.suggestion || 0} suggestions</span>
    </div>
    ${report.ai ? `<div class="verdict"><b>${esc(report.ai.readiness)}.</b> ${esc(report.ai.summary)}</div>` : ""}
    ${report.ai_error ? `<div class="notice">AI review skipped: ${esc(report.ai_error)}</div>` : ""}
    <div class="notice">${learned}</div>
    <div class="story">${highlight(body, report.issues)}</div>
    <ul class="issues">${report.issues.map((it) => `
      <li data-id="${it.id}">
        <span class="sev ${it.severity}"></span>
        <div>
          <div class="cat">${esc(it.category)}<span class="src ${it.source === "ai" ? "ai" : ""}">${it.source === "ai" ? "AI" : it.source}</span></div>
          ${it.excerpt ? `<div class="ex">“${esc(it.excerpt.length > 140 ? it.excerpt.slice(0, 140) + "…" : it.excerpt)}”</div>` : ""}
          <div>${esc(it.message)}</div>
          ${it.replacement ? `<div class="fix">→ ${esc(it.replacement)}${editable && it.start != null ? `<button class="apply" data-id="${it.id}">Apply</button>` : ""}</div>` : ""}
        </div>
      </li>`).join("") || `<li><span></span><div>No issues found.</div></li>`}
    </ul>`;

  const focus = (id) => {
    container.querySelectorAll("mark.focus").forEach((m) => m.classList.remove("focus"));
    const m = container.querySelector(`mark[data-id="${id}"]`);
    if (m) { m.classList.add("focus"); m.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  };
  container.querySelectorAll(".issues li[data-id]").forEach((li) => li.addEventListener("click", () => focus(li.dataset.id)));
  container.querySelectorAll("mark").forEach((m) => m.addEventListener("click", () => {
    const li = container.querySelector(`.issues li[data-id="${m.dataset.id}"]`);
    if (li) li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }));
  if (editable) {
    container.querySelectorAll("button.apply").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const it = report.issues.find((x) => String(x.id) === b.dataset.id);
      const ta = $("#s-body");
      if (ta.value.slice(it.start, it.end) !== it.excerpt) return toast("The story changed; run the check again.");
      ta.value = ta.value.slice(0, it.start) + it.replacement + ta.value.slice(it.end);
      const delta = it.replacement.length - (it.end - it.start);
      report.issues = report.issues.filter((x) => x !== it).map((x) => (x.start != null && x.start >= it.end ? { ...x, start: x.start + delta, end: x.end + delta } : x));
      report.counts[it.severity]--;
      renderReport(container, $("#s-title").value, ta.value, report, { editable: true });
    }));
  }
}

// ---------- reporter ----------
function storyPayload() {
  return { title: $("#s-title").value.trim(), byline: $("#s-byline").value.trim(), body: $("#s-body").value, use_ai: $("#s-ai").checked };
}

$("#btn-check").addEventListener("click", (e) => busy(e.target, "Checking…", async () => {
  const p = storyPayload();
  if (!p.title || !p.body.trim()) return toast("Add a headline and story text.");
  const report = await api("/api/check", { method: "POST", body: JSON.stringify(p) });
  renderReport($("#report"), p.title, p.body, report, { editable: true });
}));

$("#btn-submit").addEventListener("click", (e) => busy(e.target, "Submitting…", async () => {
  const p = storyPayload();
  if (!p.title || !p.body.trim()) return toast("Add a headline and story text.");
  const r = await api("/api/submissions", { method: "POST", body: JSON.stringify(p) });
  renderReport($("#report"), p.title, p.body, r.report);
  toast(`Submitted to the editor queue (#${r.id}).`);
}));

// ---------- editor ----------
async function loadQueue(selectId) {
  const f = $("#q-filter").value;
  const items = await api("/api/submissions" + (f ? `?status=${encodeURIComponent(f)}` : ""));
  const ul = $("#queue");
  ul.innerHTML = items.map((s) => `
    <li data-id="${s.id}">
      <div class="grow">
        <div class="title">${esc(s.title)}</div>
        <div>${esc(s.byline || "No byline")} · <span class="status ${s.status === "approved" ? "approved" : s.status === "needs changes" ? "needs" : ""}">${esc(s.status)}</span></div>
      </div>
      <span class="badge error">${s.counts.error || 0}</span>
      <span class="badge warning">${s.counts.warning || 0}</span>
    </li>`).join("") || `<li class="muted">Nothing here.</li>`;
  ul.querySelectorAll("li[data-id]").forEach((li) => li.addEventListener("click", () => openSubmission(li.dataset.id)));
  if (selectId) openSubmission(selectId);
}
$("#q-filter").addEventListener("change", () => loadQueue());

async function openSubmission(id) {
  document.querySelectorAll("#queue li").forEach((li) => li.classList.toggle("sel", li.dataset.id === String(id)));
  const s = await api(`/api/submissions/${id}`);
  const box = $("#sub-detail");
  box.innerHTML = `
    <h2>${esc(s.title)}</h2>
    <div class="muted">${esc(s.byline || "No byline")} · submitted ${esc(s.created_at.replace("T", " ").slice(0, 16))} UTC · <span class="status">${esc(s.status)}</span></div>
    <div id="sub-report"></div>
    <label>Note to reporter<textarea id="d-note" rows="3">${esc(s.editor_note || "")}</textarea></label>
    <div class="row">
      <button data-status="needs changes">Send back</button>
      <button data-status="approved" class="primary">Approve</button>
      <span class="grow"></span>
      ${s.status === "approved" ? `<button id="btn-promote" title="Approved stories make the learned style more accurate">Add to style archive</button>` : ""}
    </div>`;
  const rep = document.createElement("div");
  box.querySelector("#sub-report").replaceWith(rep);
  renderReport(rep, s.title, s.body, s.report);
  box.querySelectorAll("button[data-status]").forEach((b) => b.addEventListener("click", () => busy(b, "Saving…", async () => {
    await api(`/api/submissions/${id}/decision`, { method: "POST", body: JSON.stringify({ status: b.dataset.status, editor_note: $("#d-note").value }) });
    toast(b.dataset.status === "approved" ? "Approved." : "Sent back to the reporter.");
    loadQueue(id);
  })));
  const promote = box.querySelector("#btn-promote");
  if (promote) promote.addEventListener("click", () => busy(promote, "Adding…", async () => {
    await api(`/api/submissions/${id}/promote`, { method: "POST" });
    toast("Added to the archive; learned style updated.");
    loadStatus();
  }));
}

// ---------- style ----------
const PREF_FMT = (p) => `${esc(p.preferred)} <span class="muted">(${Math.round(p.share * 100)}% of ${p.evidence})</span>`;

async function loadStyle() {
  const [arts, rules, prof] = await Promise.all([api("/api/articles"), api("/api/rules"), api("/api/profile")]);
  $("#articles").innerHTML = arts.map((a) => `
    <li><div class="grow"><div class="title">${esc(a.title || "(untitled)")}</div><div class="muted">${a.chars.toLocaleString()} characters</div></div>
    <button data-del-article="${a.id}">Remove</button></li>`).join("") || `<li class="muted">No articles yet.</li>`;
  $("#rules").innerHTML = rules.map((r) => `
    <li><div class="grow"><b>${esc(r.kind)}</b> ${r.term ? `“${esc(r.term)}”` : ""} ${r.replacement ? `→ “${esc(r.replacement)}”` : ""} <span class="muted">${esc(r.reason || "")}</span></div>
    <button data-del-rule="${r.id}">Remove</button></li>`).join("") || `<li class="muted">No house rules yet.</li>`;

  const st = prof.stats;
  if (!st) {
    $("#stats").innerHTML = `<p class="muted">Add archive articles to see learned preferences.</p>`;
  } else {
    const m = st.metrics;
    const cards = Object.values(st.preferences).map((p) => `<div class="stat"><div class="k">${esc(p.label)}</div><div class="v">${PREF_FMT(p)}</div></div>`);
    cards.push(
      `<div class="stat"><div class="k">Typical sentence</div><div class="v">${m.sentence_words_median} words</div></div>`,
      `<div class="stat"><div class="k">Typical lede</div><div class="v">${m.lede_words_median} words</div></div>`,
      `<div class="stat"><div class="k">Sentences per paragraph</div><div class="v">${m.paragraph_sentences_median}</div></div>`,
      `<div class="stat"><div class="k">Spelling fixes known</div><div class="v">${Object.keys(st.spelling_map || {}).length}</div></div>`,
    );
    $("#stats").innerHTML = `<p class="muted">From ${st.article_count} articles (${st.word_count.toLocaleString()} words). A preference is only enforced when the archive is consistent about it.</p><div class="stats">${cards.join("")}</div>`;
  }
  const g = prof.guide;
  $("#guide").innerHTML = g
    ? `<p>${esc(g.voice_summary)}</p>${g.rules.map((r) => `<div class="guide-rule"><div class="cat">${esc(r.category)}</div><div>${esc(r.rule)}</div><div class="eg">${esc(r.example)}</div></div>`).join("")}
       <p class="muted">Updated ${esc((prof.guide_updated_at || "").replace("T", " ").slice(0, 16))} UTC. Re-run after adding articles.</p>`
    : `<p class="muted">Not generated yet. Once you've added articles, Claude reads them and writes down your newsroom's conventions; the reviewer then checks every story against them.</p>`;
}

document.addEventListener("click", async (e) => {
  const a = e.target.dataset?.delArticle, r = e.target.dataset?.delRule;
  if (a) { await api(`/api/articles/${a}`, { method: "DELETE" }); loadStyle(); loadStatus(); }
  if (r) { await api(`/api/rules/${r}`, { method: "DELETE" }); loadStyle(); }
});

$("#btn-upload").addEventListener("click", (e) => busy(e.target, "Uploading…", async () => {
  const files = $("#a-files").files;
  if (!files.length) return toast("Choose one or more .txt or .md files.");
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const r = await api("/api/articles/upload", { method: "POST", body: fd });
  $("#a-files").value = "";
  toast(`Added ${r.added} articles.`);
  loadStyle(); loadStatus();
}));

$("#btn-add-article").addEventListener("click", (e) => busy(e.target, "Adding…", async () => {
  const body = $("#a-body").value.trim();
  if (!body) return toast("Paste the article text.");
  await api("/api/articles", { method: "POST", body: JSON.stringify([{ title: $("#a-title").value, body }]) });
  $("#a-title").value = ""; $("#a-body").value = "";
  loadStyle(); loadStatus();
}));

$("#btn-add-rule").addEventListener("click", (e) => busy(e.target, "Adding…", async () => {
  await api("/api/rules", { method: "POST", body: JSON.stringify({
    kind: $("#r-kind").value, term: $("#r-term").value, replacement: $("#r-repl").value, reason: $("#r-reason").value,
  }) });
  ["#r-term", "#r-repl", "#r-reason"].forEach((s) => ($(s).value = ""));
  loadStyle();
}));

$("#r-kind").addEventListener("change", () => {
  const k = $("#r-kind").value;
  $("#r-term").style.display = $("#r-repl").style.display = k === "note" ? "none" : "";
  $("#r-repl").placeholder = k === "ban" ? "Suggested alternative (optional)" : "Use instead (e.g. use)";
  $("#r-reason").placeholder = k === "note" ? "e.g. Refer to people by surname only after first reference" : "Reason (optional)";
});

$("#btn-learn").addEventListener("click", (e) => busy(e.target, "Reading the archive…", async () => {
  const r = await api("/api/profile/learn", { method: "POST" });
  toast(`Style guide learned from ${r.articles_used} articles.`);
  loadStyle(); loadStatus();
}));

loadStatus();
