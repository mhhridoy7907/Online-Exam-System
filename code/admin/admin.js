
(() => {
"use strict";

const firebaseConfig = {
  apiKey: "AIzaSyC*******************rwtA2nY",
  authDomain: "mh2-i***************pp.com",
  databaseURL: "https://mh*****************firebasedatabase.app",
  projectId: "mh2-***er",
  storageBucket: "mh2-it-c*estorage.app",
  messagingSenderId: "214****15",
  appId: "1:21459492****9ff32b3e2152",
  measurementId: "G-Q****D8PPR"
};

const TEACHER_EMAIL = "teacher@mh2-it-center.com";
const ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
const TYPE_LABEL = { mcq: "MCQ", fill: "Fill in the Blank", written: "Written" };
const REASON_LABEL = { manual: "Submitted manually", timeout: "Time expired", closed: "Exam closed by teacher" };
const app = firebase.initializeApp(firebaseConfig, "mh2-teacher");
const auth = app.auth();
const db = app.database();
const TS = firebase.database.ServerValue.TIMESTAMP;
const $ = id => document.getElementById(id);

const S = {
  settings: null, secret: "", loaded: { settings: false, secret: false }, formFilled: false,
  drafts: {}, published: {}, keys: {}, students: {},
  listeners: [], subListeners: [],
  editQ: null, editSid: null, preview: null,
  viewExam: null, subs: {}, grades: {}, attempts: {}, review: null, autoGrading: {}
};

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const fmtTime = t => t ? new Date(Number(t)).toLocaleString() : "—";
const trunc = (t, n) => String(t).length > n ? String(t).slice(0, n) + "…" : String(t);
const show = id => $(id).classList.remove("hidden");
const hide = id => $(id).classList.add("hidden");
const normName = v => String(v ?? "").normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
const newExamId = () => "ex_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function sha256(text) {
  if (!(window.crypto && crypto.subtle)) throw new Error("Secure hashing requires HTTPS or localhost.");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const makeVerifier = (name, sid) => sha256("mh2|" + normName(name) + "|" + sid);

let toastTimer;
function notify(text, isError) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide("toast"), isError ? 7000 : 3500);
}

function msg(id, text, type) {
  const el = $(id);
  el.textContent = text;
  el.className = "status" + (type ? " " + type : "");
}

function friendly(e) {
  const m = String((e && e.message) || "");
  if ((e && e.code === "PERMISSION_DENIED") || /permission_denied/i.test(m)) {
    return "Permission denied by the database rules. Confirm you are signed in as the teacher. Questions cannot be published while the exam is open.";
  }
  return m || "Operation failed.";
}

async function run(btn, fn) {
  if (btn && btn.disabled) return;
  if (btn) btn.disabled = true;
  try {
    await fn();
  } catch (e) {
    console.error(e);
    notify(friendly(e), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function listen(path, cb) {
  const ref = db.ref(path);
  const fn = ref.on("value", cb, e => notify(friendly(e), true));
  S.listeners.push([ref, fn]);
}

function unlisten() {
  S.listeners.forEach(([r, f]) => r.off("value", f));
  S.listeners = [];
  S.subListeners.forEach(([r, f]) => r.off("value", f));
  S.subListeners = [];
}

function enabledTypes() {
  const t = (S.settings && S.settings.types) || {};
  return ["mcq", "fill", "written"].filter(k => t[k] === true);
}

const qList = () => Object.entries(S.drafts).map(([id, q]) => ({ id, ...q })).sort((a, b) => Number(a.order) - Number(b.order));
const pubList = () => Object.entries(S.published).map(([id, q]) => ({ id, ...q })).sort((a, b) => Number(a.order) - Number(b.order));
const blanksOf = q => Array.isArray(q.blanks) ? q.blanks : Object.values(q.blanks || {});
const blankCount = text => String(text).split("==").length - 1;

function pubState(q) {
  if (!S.published[q.id] || q.publishedRev === undefined) return "Draft";
  return q.publishedRev === q.rev ? "Published" : "Modified";
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(el => el.classList.add("hidden"));
  show("tab-" + name);
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  if (name === "submissions") run(null, loadSessions);
}

function renderExam() {
  const s = S.settings || {};
  const status = s.status || "draft";
  $("stStatus").innerHTML = `<span class="pill ${esc(status)}">${esc(status.charAt(0).toUpperCase() + status.slice(1))}</span>`;
  $("stPublished").textContent = Object.keys(S.published).length;
  $("stDrafts").textContent = Object.keys(S.drafts).length;
  $("stStudents").textContent = Object.keys(S.students).length;
  $("stSession").textContent = s.examId || "—";
}

function tryFillForm() {
  if (S.formFilled || !S.loaded.settings || !S.loaded.secret || !S.settings) return;
  S.formFilled = true;
  const s = S.settings;
  $("examTitle").value = s.title || "";
  $("examInstructions").value = s.instructions || "";
  $("examDuration").value = s.durationMinutes || 30;
  $("requireCode").checked = s.requireCode === true;
  $("examCode").value = S.secret;
}

function renderTypes() {
  const t = (S.settings && S.settings.types) || {};
  $("tMcq").checked = t.mcq === true;
  $("tFill").checked = t.fill === true;
  $("tWritten").checked = t.written === true;
  const sel = $("qType");
  const prev = sel.value;
  const types = enabledTypes();
  sel.innerHTML = types.map(k => `<option value="${k}">${TYPE_LABEL[k]}</option>`).join("");
  if (types.includes(prev)) sel.value = prev;
  sel.disabled = S.editQ !== null || !types.length;
  toggleTypePanels();
}

function toggleTypePanels() {
  const t = $("qType").value;
  $("mcqBox").classList.toggle("hidden", t !== "mcq");
  $("fillBox").classList.toggle("hidden", t !== "fill");
  $("fillHint").classList.toggle("hidden", t !== "fill");
  $("writtenBox").classList.toggle("hidden", t !== "written");
  if (t === "fill") syncBlanks();
}

function syncBlanks(values) {
  const box = $("blankInputs");
  const old = values || Array.from(box.querySelectorAll("input")).map(i => i.value);
  const n = Math.min(blankCount($("qText").value), 50);
  let html = "";
  for (let i = 0; i < n; i++) {
    html += `<div class="opt-row"><span class="muted">Blank ${i + 1}</span><input type="text" maxlength="600" data-blank="${i}" aria-label="Expected answer for blank ${i + 1}" value="${esc(old[i] || "")}"></div>`;
  }
  box.innerHTML = html || '<p class="muted">No blanks yet. Add == to the question text.</p>';
}

function previewHTML(q) {
  let body = "";
  if (q.type === "mcq") {
    const o = q.options || {};
    body = `<p>${esc(q.text)}</p>` + ["a", "b", "c", "d"].map(k => `<p>${k.toUpperCase()}. ${esc(o[k])}</p>`).join("");
  } else if (q.type === "fill") {
    body = `<p>${String(q.text).split("==").map(esc).join('<span class="blankline"></span>')}</p>`;
  } else {
    body = `<p>${esc(q.text)}</p><textarea disabled rows="3" aria-label="Preview answer area" placeholder="Student writes the answer here"></textarea>`;
  }
  return `<div class="preview"><p class="muted">Student view preview</p>${body}</div>`;
}

function renderQuestions() {
  const list = qList();
  $("qInfo").textContent = list.length;
  const removed = Object.keys(S.published).filter(id => !S.drafts[id]).length;
  const pending = list.filter(q => pubState(q) !== "Published").length + removed;
  $("pendingNote").textContent = pending ? pending + " unpublished change(s). Publish to apply them for students." : list.length ? "All draft questions are published." : "";
  $("qList").innerHTML = list.length ? list.map((q, i) => {
    const st = pubState(q);
    return `<article class="item"><div class="item-head"><strong>${i + 1}. ${esc(trunc(q.text, 180))}</strong><span class="pill ${st.toLowerCase()}">${st}</span></div><p class="muted">${TYPE_LABEL[q.type] || esc(q.type)} · ${esc(q.marks)} mark(s)</p>${S.preview === q.id ? previewHTML(q) : ""}<div class="btns"><button class="btn secondary sm" type="button" data-act="preview" data-id="${esc(q.id)}">${S.preview === q.id ? "Hide Preview" : "Preview"}</button><button class="btn secondary sm" type="button" data-act="edit" data-id="${esc(q.id)}">Edit</button><button class="btn secondary sm" type="button" data-act="up" data-id="${esc(q.id)}"${i === 0 ? " disabled" : ""} aria-label="Move up">↑</button><button class="btn secondary sm" type="button" data-act="down" data-id="${esc(q.id)}"${i === list.length - 1 ? " disabled" : ""} aria-label="Move down">↓</button><button class="btn danger sm" type="button" data-act="delete" data-id="${esc(q.id)}">Delete</button></div></article>`;
  }).join("") : '<p class="muted">No questions yet. Use the editor above to add the first question.</p>';
}

function renderStudents() {
  const term = $("sSearch").value.trim().toLowerCase();
  const all = Object.entries(S.students).map(([id, s]) => ({ id, ...s })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  $("sCount").textContent = all.length;
  const rows = all.filter(s => !term || String(s.name).toLowerCase().includes(term) || s.id.toLowerCase().includes(term));
  $("sList").innerHTML = rows.length ? rows.map(s => `<article class="item"><div class="item-head"><strong>${esc(s.name)}</strong><span class="pill ${s.active === false ? "disabled" : "open"}">${s.active === false ? "Disabled" : "Active"}</span></div><p class="muted">ID: ${esc(s.id)}</p><div class="btns"><button class="btn secondary sm" type="button" data-sact="edit" data-id="${esc(s.id)}">Edit</button><button class="btn secondary sm" type="button" data-sact="toggle" data-id="${esc(s.id)}">${s.active === false ? "Enable" : "Disable"}</button><button class="btn danger sm" type="button" data-sact="remove" data-id="${esc(s.id)}">Remove</button></div></article>`).join("") : `<p class="muted">${all.length ? "No students match your search." : "No students registered yet."}</p>`;
}

async function ensureSettings() {
  const ref = db.ref("exam/settings");
  const snap = await ref.once("value");
  if (!snap.exists()) {
    await ref.set({
      examId: newExamId(), title: "MH2 IT Center Examination", instructions: "Answer all questions carefully before submitting.",
      durationMinutes: 30, requireCode: false, status: "draft", types: { mcq: true, fill: true, written: true }, questionCount: 0, updatedAt: TS
    });
  }
}

function collectSettings() {
  const title = $("examTitle").value.trim();
  if (!title) throw new Error("Enter an examination title.");
  const duration = Number($("examDuration").value);
  if (!Number.isInteger(duration) || duration < 1 || duration > 300) throw new Error("Duration must be a whole number between 1 and 300 minutes.");
  const requireCode = $("requireCode").checked;
  const code = $("examCode").value.trim();
  if (requireCode && !code) throw new Error("Enter an exam code or disable the code requirement.");
  return { title, instructions: $("examInstructions").value.trim(), duration, requireCode, code };
}

async function saveSettings() {
  const v = collectSettings();
  const upd = {
    "exam/settings/title": v.title,
    "exam/settings/instructions": v.instructions,
    "exam/settings/durationMinutes": v.duration,
    "exam/settings/requireCode": v.requireCode,
    "exam/settings/updatedAt": TS,
    "examSecrets/code": v.requireCode ? v.code : null
  };
  await db.ref().update(upd);
  msg("examMsg", "Settings saved and synchronized.", "success");
  notify("Settings saved.");
}

async function openExam() {
  await saveSettings();
  const published = Object.keys(S.published).length;
  if (!published) throw new Error("Publish at least one question before opening the exam.");
  const unpublished = qList().filter(q => pubState(q) !== "Published").length;
  if (unpublished && !window.confirm(unpublished + " draft question(s) are not published and will not appear to students. Open anyway?")) return;
  await db.ref().update({ "exam/settings/status": "open", "exam/settings/openedAt": TS, "exam/settings/closedAt": null, "exam/settings/updatedAt": TS });
  msg("examMsg", "The exam is open. Students can start new attempts.", "success");
  notify("Exam opened.");
}

async function closeExam() {
  if (!window.confirm("Close the exam now? New attempts will be blocked and active students will have their answers submitted automatically.")) return;
  await db.ref().update({ "exam/settings/status": "closed", "exam/settings/closedAt": TS, "exam/settings/updatedAt": TS });
  msg("examMsg", "The exam is closed. Active attempts are auto-submitted by the student page.", "success");
  notify("Exam closed.");
}

async function newSession() {
  if (!window.confirm("Start a new session? Previous attempts and submissions stay stored under the old session, and the exam returns to Draft.")) return;
  await db.ref().update({ "exam/settings/examId": newExamId(), "exam/settings/status": "draft", "exam/settings/openedAt": null, "exam/settings/closedAt": null, "exam/settings/updatedAt": TS });
  msg("examMsg", "New session created. Open the exam when ready.", "success");
}

async function saveTypes() {
  const types = { mcq: $("tMcq").checked, fill: $("tFill").checked, written: $("tWritten").checked };
  try {
    if (!types.mcq && !types.fill && !types.written) throw new Error("Select at least one question type.");
    const used = qList().find(q => !types[q.type]);
    if (used) throw new Error("Remove or edit your " + TYPE_LABEL[used.type] + " questions before disabling that type.");
    await db.ref("exam/settings").update({ types, updatedAt: TS });
    msg("typesMsg", "Question types saved.", "success");
  } catch (e) {
    renderTypes();
    msg("typesMsg", friendly(e), "error");
    notify(friendly(e), true);
  }
}

function resetQuestionForm() {
  S.editQ = null;
  $("qForm").reset();
  $("qText").value = "";
  $("qMarks").value = 1;
  $("qTrim").checked = true;
  $("blankInputs").innerHTML = "";
  $("qFormTitle").textContent = "Add Question";
  $("qSave").textContent = "Save Draft Question";
  hide("qCancel");
  renderTypes();
}

function editQuestion(id) {
  const q = S.drafts[id];
  if (!q) return;
  S.editQ = id;
  renderTypes();
  $("qType").innerHTML = `<option value="${esc(q.type)}">${TYPE_LABEL[q.type]}</option>`;
  $("qType").value = q.type;
  $("qType").disabled = true;
  toggleTypePanels();
  $("qText").value = q.text;
  $("qMarks").value = q.marks;
  if (q.type === "mcq") {
    ["a", "b", "c", "d"].forEach(k => { $("q" + k.toUpperCase()).value = (q.options && q.options[k]) || ""; });
    document.querySelectorAll('input[name="qCorrect"]').forEach(r => { r.checked = r.value === q.correct; });
  } else if (q.type === "fill") {
    $("qCase").checked = q.caseSensitive === true;
    $("qTrim").checked = q.trimSpace !== false;
    syncBlanks(blanksOf(q));
  } else {
    $("qGuide").value = q.guidelines || "";
  }
  $("qFormTitle").textContent = "Edit Question";
  $("qSave").textContent = "Update Question";
  show("qCancel");
  $("qForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveQuestion() {
  const editing = S.editQ !== null;
  const type = editing ? S.drafts[S.editQ].type : $("qType").value;
  if (!type || !enabledTypes().includes(type)) throw new Error("Select and save an enabled question type first.");
  const text = $("qText").value.trim();
  if (!text) throw new Error("Enter the question text.");
  const marks = Number($("qMarks").value);
  if (!(marks > 0 && marks <= 100)) throw new Error("Marks must be greater than 0 and at most 100.");
  const q = { type, text, marks, rev: Date.now() };
  if (type === "mcq") {
    const options = {};
    for (const k of ["a", "b", "c", "d"]) {
      const v = $("q" + k.toUpperCase()).value.trim();
      if (!v) throw new Error("Fill in all four options A, B, C and D.");
      options[k] = v;
    }
    const checked = document.querySelector('input[name="qCorrect"]:checked');
    if (!checked) throw new Error("Select exactly one correct answer.");
    q.options = options;
    q.correct = checked.value;
  } else if (type === "fill") {
    const n = blankCount(text);
    if (n < 1) throw new Error("Add at least one == marker for a blank.");
    if (n > 50) throw new Error("A question can contain at most 50 blanks.");
    const inputs = Array.from($("blankInputs").querySelectorAll("input"));
    if (inputs.length !== n) throw new Error("The number of expected answers must match the number of == markers.");
    const blanks = inputs.map(i => i.value.trim());
    if (blanks.some(b => !b)) throw new Error("Enter an expected answer for every blank.");
    q.blanks = blanks;
    q.caseSensitive = $("qCase").checked;
    q.trimSpace = $("qTrim").checked;
  } else {
    q.guidelines = $("qGuide").value.trim();
  }
  if (editing) {
    await db.ref("drafts/" + S.editQ).update(q);
  } else {
    const order = qList().reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1;
    q.order = order;
    await db.ref("drafts/" + db.ref("drafts").push().key).set(q);
  }
  msg("qMsg", editing ? "Question updated as a draft." : "Question saved as a draft.", "success");
  notify("Question saved.");
  resetQuestionForm();
}

async function moveQuestion(id, dir) {
  const list = qList();
  const i = list.findIndex(q => q.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const upd = {};
  const reordered = list.slice();
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  reordered.forEach((q, idx) => { if (Number(q.order) !== idx + 1) upd["drafts/" + q.id + "/order"] = idx + 1; });
  upd["drafts/" + list[i].id + "/rev"] = Date.now();
  upd["drafts/" + list[j].id + "/rev"] = Date.now();
  await db.ref().update(upd);
}

async function deleteQuestion(id) {
  if (!window.confirm("Delete this draft question? If it was published it is removed for students at the next publish.")) return;
  await db.ref("drafts/" + id).remove();
  if (S.editQ === id) resetQuestionForm();
  notify("Question deleted.");
}

function publishedView(q, order) {
  const p = { type: q.type, text: q.text, marks: q.marks, order };
  if (q.type === "mcq") p.options = q.options;
  if (q.type === "fill") p.blanks = blankCount(q.text);
  return p;
}

function keyView(q) {
  const k = { type: q.type, marks: q.marks };
  if (q.type === "mcq") k.correct = q.correct;
  if (q.type === "fill") { k.blanks = blanksOf(q); k.caseSensitive = q.caseSensitive === true; k.trimSpace = q.trimSpace !== false; }
  if (q.type === "written") k.guidelines = q.guidelines || "";
  return k;
}

async function publishQuestions() {
  if (S.settings && S.settings.status === "open") throw new Error("Close the exam before publishing questions.");
  const list = qList();
  if (!list.length) throw new Error("Add at least one question before publishing.");
  const types = enabledTypes();
  const bad = list.find(q => !types.includes(q.type));
  if (bad) throw new Error("A " + TYPE_LABEL[bad.type] + " question exists but that type is not enabled.");
  const missing = types.find(t => !list.some(q => q.type === t));
  if (missing) throw new Error("The " + TYPE_LABEL[missing] + " type is enabled but has no questions. Add one or uncheck the type.");
  const upd = {};
  Object.keys(S.published).forEach(id => { if (!S.drafts[id]) { upd["published/" + id] = null; upd["answerKeys/" + id] = null; } });
  list.forEach((q, i) => {
    upd["published/" + q.id] = publishedView(q, i + 1);
    upd["answerKeys/" + q.id] = keyView(q);
    upd["drafts/" + q.id + "/publishedRev"] = q.rev;
    upd["drafts/" + q.id + "/order"] = i + 1;
  });
  upd["exam/settings/questionCount"] = list.length;
  upd["exam/settings/publishedAt"] = TS;
  upd["exam/settings/updatedAt"] = TS;
  await db.ref().update(upd);
  msg("qMsg", list.length + " question(s) published.", "success");
  notify("Questions published.");
}

async function reloadQuestions() {
  const [d, p, k] = await Promise.all([db.ref("drafts").once("value"), db.ref("published").once("value"), db.ref("answerKeys").once("value")]);
  S.drafts = d.val() || {};
  S.published = p.val() || {};
  S.keys = k.val() || {};
  renderQuestions();
  renderExam();
  notify("Reloaded from Firebase.");
}

async function saveStudent() {
  const name = $("sName").value.trim().replace(/\s+/g, " ");
  const id = $("sId").value.trim();
  if (!name || name.length > 100) throw new Error("Enter the student's full name (up to 100 characters).");
  if (!ID_PATTERN.test(id)) throw new Error("Student ID may contain only letters, numbers, hyphens and underscores (max 50).");
  const hash = await makeVerifier(name, id);
  const oldId = S.editSid;
  if (oldId === null) {
    const tx = await db.ref("students/" + id).transaction(cur => cur === null ? { name, active: true, createdAt: Date.now() } : undefined);
    if (!tx.committed) throw new Error("A student with ID " + id + " already exists.");
    try {
      await db.ref("studentVerify/" + id).set({ hash, active: true });
    } catch (e) {
      await db.ref("students/" + id).remove();
      throw e;
    }
    msg("sMsg", "Student added successfully.", "success");
  } else if (oldId === id) {
    await db.ref().update({ ["students/" + id + "/name"]: name, ["studentVerify/" + id + "/hash"]: hash });
    msg("sMsg", "Student updated successfully.", "success");
  } else {
    const old = S.students[oldId] || {};
    const tx = await db.ref("students/" + id).transaction(cur => cur === null ? { name, active: old.active !== false, createdAt: old.createdAt || Date.now() } : undefined);
    if (!tx.committed) throw new Error("A student with ID " + id + " already exists.");
    await db.ref().update({
      ["studentVerify/" + id]: { hash, active: old.active !== false },
      ["students/" + oldId]: null,
      ["studentVerify/" + oldId]: null
    });
    msg("sMsg", "Student updated successfully.", "success");
  }
  notify("Student saved.");
  resetStudentForm();
}

function resetStudentForm() {
  S.editSid = null;
  $("sForm").reset();
  $("sFormTitle").textContent = "Add Student";
  $("sSave").textContent = "Add Student";
  hide("sCancel");
}

async function studentAction(act, id) {
  const s = S.students[id];
  if (!s) return;
  if (act === "edit") {
    S.editSid = id;
    $("sName").value = s.name;
    $("sId").value = id;
    $("sFormTitle").textContent = "Edit Student";
    $("sSave").textContent = "Save Changes";
    show("sCancel");
    $("sName").focus();
  } else if (act === "toggle") {
    const active = s.active === false;
    await db.ref().update({ ["students/" + id + "/active"]: active, ["studentVerify/" + id + "/active"]: active });
    msg("sMsg", "Student " + (active ? "enabled" : "disabled") + ".", "success");
  } else if (act === "remove") {
    if (!window.confirm("Remove " + s.name + " (" + id + ")?")) return;
    await db.ref().update({ ["students/" + id]: null, ["studentVerify/" + id]: null });
    if (S.editSid === id) resetStudentForm();
    msg("sMsg", "Student removed.", "success");
  }
}

function expectedList(k) {
  return Array.isArray(k.blanks) ? k.blanks : Object.values(k.blanks || {});
}

function sameText(given, expected, key) {
  return String(expected).split("|").some(alt => {
    let e = alt;
    let g = String(given ?? "");
    if (key.trimSpace !== false) { e = e.trim(); g = g.trim(); }
    if (!key.caseSensitive) { e = e.toLowerCase(); g = g.toLowerCase(); }
    return e !== "" && e === g;
  });
}

function evaluate(sub) {
  const ev = { objective: 0, objectiveMax: 0, writtenMax: 0, total: 0, items: [] };
  pubList().forEach(q => {
    const key = S.keys[q.id];
    if (!key) return;
    const ans = (sub.answers && sub.answers[q.id]) || {};
    const max = Number(key.marks) || 0;
    const item = { q, key, max, awarded: 0, status: "blank", given: "" };
    ev.total += max;
    if (q.type === "mcq") {
      ev.objectiveMax += max;
      item.given = ans.a || "";
      if (ans.a) {
        if (ans.a === key.correct) { item.awarded = max; item.status = "correct"; } else { item.status = "wrong"; }
      }
      ev.objective += item.awarded;
    } else if (q.type === "fill") {
      ev.objectiveMax += max;
      const exp = expectedList(key);
      const given = exp.map((_, i) => String((ans.f && ans.f[i]) ?? ""));
      let ok = 0;
      given.forEach((g, i) => { if (sameText(g, exp[i], key)) ok++; });
      item.given = given;
      item.expected = exp;
      item.ok = ok;
      item.awarded = round2(max * ok / (exp.length || 1));
      item.status = given.every(g => !g.trim()) ? "blank" : ok === exp.length ? "correct" : ok > 0 ? "partial" : "wrong";
      ev.objective += item.awarded;
    } else {
      ev.writtenMax += max;
      item.given = ans.a || "";
      item.status = String(item.given).trim() ? "manual" : "blank";
    }
    ev.items.push(item);
  });
  ev.objective = round2(ev.objective);
  return ev;
}

function buildGrade(sub, written) {
  const ev = evaluate(sub);
  const detail = {};
  let wt = 0;
  let pending = false;
  ev.items.forEach(it => {
    let aw = it.awarded;
    let st = it.status;
    if (it.q.type === "written") {
      if (written[it.q.id] !== undefined) {
        aw = written[it.q.id];
        st = "graded";
        wt += aw;
      } else {
        aw = 0;
        if (it.status !== "blank") { st = "pending"; pending = true; }
      }
    }
    detail[it.q.id] = { awarded: round2(aw), max: it.max, status: st };
  });
  const rec = {
    objective: ev.objective, objectiveMax: round2(ev.objectiveMax), writtenMax: round2(ev.writtenMax),
    total: round2(ev.total), writtenTotal: round2(wt), awarded: round2(ev.objective + wt), pending, detail, gradedAt: TS
  };
  if (Object.keys(written).length) rec.written = written;
  return rec;
}

async function loadSessions() {
  const [a, s] = await Promise.all([db.ref("attempts").once("value"), db.ref("submissions").once("value")]);
  const ids = new Set();
  if (S.settings && S.settings.examId) ids.add(S.settings.examId);
  Object.keys(a.val() || {}).forEach(k => ids.add(k));
  Object.keys(s.val() || {}).forEach(k => ids.add(k));
  const cur = S.settings && S.settings.examId;
  $("subExam").innerHTML = Array.from(ids).map(id => `<option value="${esc(id)}">${esc(id)}${id === cur ? " (current)" : ""}</option>`).join("");
  if (!S.viewExam || !ids.has(S.viewExam)) S.viewExam = cur || Array.from(ids)[0] || null;
  if (S.viewExam) $("subExam").value = S.viewExam;
  watchSession(S.viewExam);
}

function watchSession(ex) {
  S.subListeners.forEach(([r, f]) => r.off("value", f));
  S.subListeners = [];
  S.subs = {};
  S.grades = {};
  S.attempts = {};
  S.review = null;
  hide("reviewBox");
  renderSubmissions();
  if (!ex) return;
  const map = { submissions: "subs", grades: "grades", attempts: "attempts" };
  Object.keys(map).forEach(k => {
    const ref = db.ref(k + "/" + ex);
    const fn = ref.on("value", snap => {
      S[map[k]] = snap.val() || {};
      renderSubmissions();
      if (S.review) renderReview();
      autoGrade();
    }, e => notify(friendly(e), true));
    S.subListeners.push([ref, fn]);
  });
}

function autoGrade() {
  const cur = S.settings && S.settings.examId;
  if (!cur || S.viewExam !== cur || !Object.keys(S.published).length || !Object.keys(S.keys).length) return;
  const upd = {};
  Object.entries(S.subs).forEach(([sid, sub]) => {
    if (!S.grades[sid] && !S.autoGrading[cur + "/" + sid]) {
      S.autoGrading[cur + "/" + sid] = true;
      upd["grades/" + cur + "/" + sid] = buildGrade(sub, {});
    }
  });
  if (Object.keys(upd).length) {
    db.ref().update(upd).catch(e => {
      Object.keys(upd).forEach(p => { delete S.autoGrading[p.replace("grades/", "")]; });
      notify(friendly(e), true);
    });
  }
}

function renderSubmissions() {
  const rows = Object.entries(S.subs).map(([sid, s]) => ({ sid, s, g: S.grades[sid] })).sort((a, b) => Number(b.s.submittedAt || 0) - Number(a.s.submittedAt || 0));
  $("subList").innerHTML = rows.length ? rows.map(({ sid, s, g }) => {
    const ev = g ? null : evaluate(s);
    const awarded = g ? g.awarded : ev.objective;
    const total = g ? g.total : ev.total;
    const pending = g ? g.pending === true : false;
    return `<article class="item"><div class="item-head"><strong>${esc(s.studentName)} · ${esc(s.studentId)}</strong><span class="pill ${pending ? "pending" : "final"}">${pending ? "Pending review" : "Reviewed"}</span></div><p class="muted">${esc(s.examTitle)} · Attempt ${esc(s.attemptId)}</p><p class="muted">Submitted ${esc(fmtTime(s.submittedAt))} · ${esc(REASON_LABEL[s.reason] || s.reason)}</p><p><strong>${round2(awarded)}</strong> / ${round2(total)} marks</p><div class="btns"><button class="btn secondary sm" type="button" data-review="${esc(sid)}">Open &amp; Grade</button></div></article>`;
  }).join("") : '<p class="muted">No submissions for this session yet.</p>';
  const open = Object.entries(S.attempts).filter(([sid]) => !S.subs[sid]);
  $("attList").innerHTML = open.length ? open.map(([sid, a]) => `<article class="item"><div class="item-head"><strong>${esc(a.studentName)} · ${esc(sid)}</strong><span class="pill draft">In progress</span></div><p class="muted">Started ${esc(fmtTime(a.startedAt))} · ${esc(a.durationMinutes)} min · Attempt ${esc(a.attemptId)}</p><div class="btns"><button class="btn danger sm" type="button" data-reset="${esc(sid)}">Reset Attempt</button></div></article>`).join("") : '<p class="muted">No attempts without a submission.</p>';
}

function renderReview() {
  const sid = S.review;
  const sub = S.subs[sid];
  if (!sub) { hide("reviewBox"); return; }
  const ev = evaluate(sub);
  const g = S.grades[sid] || {};
  const written = g.written || {};
  let html = `<h2>${esc(sub.studentName)} · ${esc(sub.studentId)}</h2><p class="muted">${esc(sub.examTitle)} · Attempt ${esc(sub.attemptId)} · ${esc(fmtTime(sub.submittedAt))} · ${esc(REASON_LABEL[sub.reason] || sub.reason)}</p>`;
  if (!ev.items.length) html += '<div class="status error">The questions for this session are no longer available, so answers cannot be graded.</div>';
  ev.items.forEach((it, i) => {
    html += `<article class="item"><div class="item-head"><strong>${i + 1}. ${esc(trunc(it.q.text, 300))}</strong><span class="pill ${esc(it.status)}">${esc(it.status)}</span></div><p class="muted">${TYPE_LABEL[it.q.type]} · ${it.max} mark(s)</p>`;
    if (it.q.type === "mcq") {
      const o = it.q.options || {};
      html += `<div class="answerbox">Student answer: ${it.given ? esc(it.given.toUpperCase() + ". " + (o[it.given] || "")) : "<em>No answer</em>"}</div><div class="answerbox">Correct answer: ${esc(String(it.key.correct).toUpperCase() + ". " + (o[it.key.correct] || ""))}</div><p>Marks awarded: <strong>${it.awarded}</strong> / ${it.max}</p>`;
    } else if (it.q.type === "fill") {
      html += it.given.map((gv, bi) => `<div class="answerbox">Blank ${bi + 1}: ${gv.trim() ? esc(gv) : "<em>No answer</em>"} — expected: ${esc(it.expected[bi])}</div>`).join("") + `<p>Correct blanks: ${it.ok} / ${it.expected.length} · Marks awarded: <strong>${it.awarded}</strong> / ${it.max}</p>`;
    } else {
      html += `<div class="answerbox pre">${String(it.given).trim() ? esc(it.given) : "<em>No answer</em>"}</div>`;
      if (it.key.guidelines) html += `<p class="muted pre">Guidelines: ${esc(it.key.guidelines)}</p>`;
      html += `<label for="wm_${esc(it.q.id)}">Marks (0 – ${it.max})</label><input id="wm_${esc(it.q.id)}" type="number" min="0" max="${it.max}" step="0.5" data-wq="${esc(it.q.id)}" data-max="${it.max}" value="${written[it.q.id] !== undefined ? written[it.q.id] : ""}">`;
    }
    html += "</article>";
  });
  const awarded = g.awarded !== undefined ? g.awarded : ev.objective;
  const total = g.total !== undefined ? g.total : ev.total;
  html += `<div class="status ${g.pending ? "" : "success"}">Result: <strong>${round2(awarded)}</strong> / ${round2(total)} · Objective: ${ev.objective} / ${round2(ev.objectiveMax)} · ${g.pending ? "Pending manual review" : "Final"}</div><div class="actions"><button class="btn" type="button" id="saveGrades">Save Grades</button><button class="btn secondary" type="button" id="closeReview">Close</button></div>`;
  $("reviewBox").innerHTML = html;
  show("reviewBox");
}

async function saveGrades() {
  const sid = S.review;
  const sub = S.subs[sid];
  if (!sub) throw new Error("Submission not found.");
  const written = {};
  document.querySelectorAll("#reviewBox [data-wq]").forEach(el => {
    if (el.value === "") return;
    const v = Number(el.value);
    const max = Number(el.dataset.max);
    if (!(v >= 0 && v <= max)) throw new Error("Written marks must be between 0 and " + max + ".");
    written[el.dataset.wq] = round2(v);
  });
  await db.ref("grades/" + S.viewExam + "/" + sid).set(buildGrade(sub, written));
  notify("Grades saved.");
}

async function login(ev) {
  ev.preventDefault();
  const code = $("teacherCode").value;
  if (!code) return;
  $("loginBtn").disabled = true;
  msg("loginStatus", "Signing in…");
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    await auth.signInWithEmailAndPassword(TEACHER_EMAIL, code);
    $("teacherCode").value = "";
  } catch (e) {
    console.error(e);
    const c = e && e.code;
    let text = "Sign-in failed. Try again.";
    if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/invalid-login-credentials") text = "Incorrect teacher access code, or the teacher account has not been created in Firebase Authentication.";
    else if (c === "auth/user-not-found") text = "The teacher account does not exist. Create the user " + TEACHER_EMAIL + " in Firebase Console > Authentication > Users, using the teacher access code as its password.";
    else if (c === "auth/operation-not-allowed") text = "Email/Password sign-in is disabled. Enable it in Firebase Console > Authentication > Sign-in method.";
    else if (c === "auth/too-many-requests") text = "Too many attempts. Wait a few minutes and try again.";
    else if (c === "auth/network-request-failed") text = "Network error. Check your connection.";
    msg("loginStatus", text, "error");
  } finally {
    $("loginBtn").disabled = false;
  }
}

async function enterDashboard() {
  hide("loginView");
  show("dashboard");
  show("logoutBtn");
  try {
    await ensureSettings();
  } catch (e) {
    notify(friendly(e), true);
    return;
  }
  listen("exam/settings", snap => {
    S.settings = snap.val();
    S.loaded.settings = true;
    tryFillForm();
    renderExam();
    renderTypes();
    renderQuestions();
    autoGrade();
  });
  listen("examSecrets/code", snap => {
    S.secret = snap.val() || "";
    S.loaded.secret = true;
    tryFillForm();
  });
  listen("drafts", snap => { S.drafts = snap.val() || {}; renderExam(); renderQuestions(); });
  listen("published", snap => { S.published = snap.val() || {}; renderExam(); renderQuestions(); if (S.review) renderReview(); autoGrade(); });
  listen("answerKeys", snap => { S.keys = snap.val() || {}; if (S.review) renderReview(); autoGrade(); });
  listen("students", snap => { S.students = snap.val() || {}; renderExam(); renderStudents(); });
}

function leaveDashboard() {
  unlisten();
  S.settings = null;
  S.loaded = { settings: false, secret: false };
  S.formFilled = false;
  S.drafts = {};
  S.published = {};
  S.keys = {};
  S.students = {};
  S.viewExam = null;
  S.review = null;
  hide("dashboard");
  hide("logoutBtn");
  show("loginView");
  msg("loginStatus", "Enter the teacher access code to continue.");
}

auth.onAuthStateChanged(user => {
  if (user && user.email === TEACHER_EMAIL) {
    enterDashboard();
  } else {
    if (user) auth.signOut();
    leaveDashboard();
  }
});

$("loginForm").addEventListener("submit", login);
$("logoutBtn").addEventListener("click", () => auth.signOut());
document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));

$("saveSettings").addEventListener("click", e => run(e.currentTarget, saveSettings));
$("openExam").addEventListener("click", e => run(e.currentTarget, openExam));
$("closeExam").addEventListener("click", e => run(e.currentTarget, closeExam));
$("newSession").addEventListener("click", e => run(e.currentTarget, newSession));

["tMcq", "tFill", "tWritten"].forEach(id => $(id).addEventListener("change", saveTypes));
$("qType").addEventListener("change", toggleTypePanels);
$("qText").addEventListener("input", () => { if ($("qType").value === "fill") syncBlanks(); });
$("qForm").addEventListener("submit", e => { e.preventDefault(); run($("qSave"), saveQuestion).catch(() => {}); });
$("qCancel").addEventListener("click", resetQuestionForm);
$("publishBtn").addEventListener("click", e => run(e.currentTarget, publishQuestions));
$("reloadBtn").addEventListener("click", e => run(e.currentTarget, reloadQuestions));

$("qList").addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const id = b.dataset.id;
  const act = b.dataset.act;
  if (act === "preview") { S.preview = S.preview === id ? null : id; renderQuestions(); }
  else if (act === "edit") editQuestion(id);
  else if (act === "up") run(b, () => moveQuestion(id, -1));
  else if (act === "down") run(b, () => moveQuestion(id, 1));
  else if (act === "delete") run(b, () => deleteQuestion(id));
});

$("sForm").addEventListener("submit", e => { e.preventDefault(); run($("sSave"), saveStudent); });
$("sCancel").addEventListener("click", resetStudentForm);
$("sSearch").addEventListener("input", renderStudents);
$("sList").addEventListener("click", e => {
  const b = e.target.closest("[data-sact]");
  if (b) run(b, () => studentAction(b.dataset.sact, b.dataset.id));
});

$("subExam").addEventListener("change", () => { S.viewExam = $("subExam").value; watchSession(S.viewExam); });
$("subRefresh").addEventListener("click", e => run(e.currentTarget, loadSessions));
$("subList").addEventListener("click", e => {
  const b = e.target.closest("[data-review]");
  if (!b) return;
  S.review = b.dataset.review;
  renderReview();
  $("reviewBox").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("attList").addEventListener("click", e => {
  const b = e.target.closest("[data-reset]");
  if (!b) return;
  const sid = b.dataset.reset;
  run(b, async () => {
    if (!window.confirm("Reset this in-progress attempt? The student's unsubmitted work on the server is discarded and they may start again.")) return;
    const a = S.attempts[sid];
    const upd = { ["attempts/" + S.viewExam + "/" + sid]: null };
    if (a && a.uid) upd["attemptsByUid/" + S.viewExam + "/" + a.uid] = null;
    await db.ref().update(upd);
    notify("Attempt reset.");
  });
});
$("reviewBox").addEventListener("click", e => {
  if (e.target.id === "saveGrades") run(e.target, saveGrades);
  if (e.target.id === "closeReview") { S.review = null; hide("reviewBox"); }
});
})();
