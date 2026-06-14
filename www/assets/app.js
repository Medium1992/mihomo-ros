/* ── mihomo-ros web UI ─────────────────────────────────────── */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const code = $("code");
  const gutter = $("gutter");
  const consoleBody = $("consoleBody");
  const consoleTitle = $("consoleTitle");
  const toast = $("toast");

  let view = "yaml";        // "yaml" | "sh"
  let dirty = false;
  let busy = false;
  let curScript = null;     // selected script file name (sh view)

  /* ── line-number gutter ─────────────────────────────────── */
  function renderGutter() {
    const lines = code.value.split("\n").length;
    let out = "";
    for (let i = 1; i <= lines; i++) out += i + "\n";
    gutter.textContent = out;
  }
  function syncScroll() { gutter.scrollTop = code.scrollTop; }

  code.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      document.execCommand("insertText", false, "  ");
    }
  });
  code.addEventListener("input", () => { dirty = true; renderGutter(); });
  code.addEventListener("scroll", syncScroll);

  /* ── console + toast ────────────────────────────────────── */
  function setConsole(title, text, kind) {
    consoleTitle.textContent = title;
    consoleBody.textContent = text || "—";
    consoleBody.className = "console-body " + (kind || "muted");
  }
  function showToast(text, kind) {
    toast.textContent = text;
    toast.className = "toast show " + (kind || "");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.className = "toast"), 3200);
  }
  function setBusy(b) {
    busy = b;
    document.querySelectorAll(".topbar-actions .btn, .files .btn")
      .forEach((el) => (el.disabled = b));
  }

  async function jsonFetch(url, opts) {
    const r = await fetch(url, Object.assign({ cache: "no-store" }, opts));
    return r.json();
  }

  /* ── status badge ───────────────────────────────────────── */
  async function refreshStatus() {
    try {
      const j = await jsonFetch("/cgi-bin/status");
      $("statusDot").className = "dot " + (j.running ? "up" : "down");
      $("statusText").textContent = j.running ? "ядро запущено" : "ядро недоступно";
      $("version").textContent = j.version || "—";
      if (j.config && view === "yaml") $("cfgPath").textContent = j.config;
    } catch (_) {
      $("statusDot").className = "dot down";
      $("statusText").textContent = "нет связи";
    }
  }

  /* ════════════════ YAML view ════════════════ */
  async function loadConfig() {
    try {
      const r = await fetch("/cgi-bin/get-config", { cache: "no-store" });
      code.value = await r.text();
      dirty = false;
      renderGutter();
      setConsole("Консоль", "Конфиг загружен. Отредактируй и нажми «Применить».", "muted");
    } catch (e) {
      setConsole("Ошибка", "Не удалось загрузить конфиг: " + e, "err");
    }
  }

  async function validate() {
    if (busy) return;
    setBusy(true);
    setConsole("Проверка…", "Запускаю mihomo -t …", "muted");
    try {
      const j = await jsonFetch("/cgi-bin/validate", {
        method: "POST", headers: { "Content-Type": "text/plain" }, body: code.value,
      });
      if (j.ok) { setConsole("Проверка пройдена", j.output || "Конфиг валиден ✓", "ok"); showToast("Конфиг валиден ✓", "ok"); }
      else { setConsole("Ошибка валидации", j.output || "unknown error", "err"); showToast("Конфиг невалиден ✗", "err"); }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (busy) return;
    setBusy(true);
    setConsole("Применение…", "Проверка и горячая перезагрузка ядра…", "muted");
    try {
      const j = await jsonFetch("/cgi-bin/save-config", {
        method: "POST", headers: { "Content-Type": "text/plain" }, body: code.value,
      });
      if (j.ok) {
        dirty = false;
        setConsole("Применено", "Конфиг сохранён и применён ✓", "ok");
        showToast("Конфиг применён ✓", "ok");
        refreshStatus();
      } else {
        const stage = j.stage === "apply" ? "Сохранён, но перезагрузка не удалась" : "Ошибка валидации";
        setConsole(stage, j.output || "unknown error", "err");
        showToast(stage, "err");
      }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  /* ════════════════ SH view ════════════════ */
  async function loadScriptList(selectFile) {
    let list = [];
    try { list = await jsonFetch("/cgi-bin/list-scripts"); } catch (_) {}
    const ul = $("filesList");
    ul.innerHTML = "";
    if (!list.length) {
      ul.innerHTML = '<li class="files-empty">пусто · создай скрипт</li>';
    }
    list.forEach((it) => {
      const li = document.createElement("li");
      li.className = "file-item" + (it.enabled ? "" : " off") + (it.file === curScript ? " sel" : "");
      li.dataset.file = it.file;
      li.innerHTML =
        '<span class="file-dot"></span>' +
        '<span class="file-name"></span>' +
        '<span class="file-tag">' + (it.enabled ? "" : "выкл") + "</span>";
      li.querySelector(".file-name").textContent = it.name;
      li.addEventListener("click", () => openScript(it.file));
      ul.appendChild(li);
    });
    if (selectFile) {
      const exists = list.some((it) => it.file === selectFile);
      if (exists) openScript(selectFile);
    } else if (curScript && !list.some((it) => it.file === curScript)) {
      curScript = null; code.value = ""; renderGutter();
    }
  }

  async function openScript(file) {
    if (dirty && curScript && curScript !== file &&
        !confirm("Изменения в текущем скрипте не сохранены. Открыть другой?")) return;
    try {
      const r = await fetch("/cgi-bin/get-script?name=" + encodeURIComponent(file), { cache: "no-store" });
      code.value = await r.text();
      curScript = file;
      dirty = false;
      renderGutter();
      $("cfgPath").textContent = "/etc/mihomo/scripts/" + file;
      setConsole("Скрипт", file, "muted");
      markSelected();
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
  }

  function markSelected() {
    document.querySelectorAll("#filesList .file-item").forEach((li) =>
      li.classList.toggle("sel", li.dataset.file === curScript));
  }

  async function saveScript() {
    if (busy) return;
    if (!curScript) { showToast("Сначала создай или выбери скрипт", "err"); return; }
    setBusy(true);
    try {
      const j = await jsonFetch("/cgi-bin/save-script?name=" + encodeURIComponent(curScript), {
        method: "POST", headers: { "Content-Type": "text/plain" }, body: code.value,
      });
      if (j.ok) { dirty = false; setConsole("Сохранено", curScript, "ok"); showToast("Скрипт сохранён ✓", "ok"); loadScriptList(); }
      else { setConsole("Ошибка", j.output || "unknown", "err"); showToast("Не сохранено ✗", "err"); }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  async function validateScript() {
    if (busy || !curScript) { if (!curScript) showToast("Выбери или создай скрипт", "err"); return; }
    setBusy(true);
    setConsole("Проверка…", "Запускаю sh -n …", "muted");
    try {
      const j = await jsonFetch("/cgi-bin/validate-script", {
        method: "POST", headers: { "Content-Type": "text/plain" }, body: code.value,
      });
      if (j.ok) { setConsole("Проверка пройдена", j.output || "Синтаксис OK ✓", "ok"); showToast("Синтаксис OK ✓", "ok"); }
      else { setConsole("Ошибка синтаксиса", j.output || "unknown error", "err"); showToast("Ошибка синтаксиса ✗", "err"); }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  async function runScript() {
    if (busy || !curScript) { if (!curScript) showToast("Выбери скрипт", "err"); return; }
    if (dirty && !confirm("Скрипт не сохранён — запустить версию с диска?")) return;
    setBusy(true);
    setConsole("Запуск…", "Выполняю " + curScript + " …", "muted");
    try {
      const j = await jsonFetch("/cgi-bin/run-script?name=" + encodeURIComponent(curScript), { method: "POST" });
      setConsole(j.ok ? "Готово ✓" : "Скрипт завершился с ошибкой", j.output || "(нет вывода)", j.ok ? "ok" : "err");
      showToast(j.ok ? "Скрипт выполнен ✓" : "Ошибка выполнения ✗", j.ok ? "ok" : "err");
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  async function toggleScript() {
    if (busy || !curScript) { if (!curScript) showToast("Выбери скрипт", "err"); return; }
    setBusy(true);
    try {
      const j = await jsonFetch("/cgi-bin/toggle-script?name=" + encodeURIComponent(curScript), { method: "POST" });
      if (j.ok) {
        curScript = j.file;                       // name changes (.disabled)
        setConsole("Скрипт", (j.enabled ? "включён: " : "выключен: ") + j.file, "ok");
        showToast(j.enabled ? "Включён ✓" : "Выключен", "ok");
        $("cfgPath").textContent = "/etc/mihomo/scripts/" + j.file;
        loadScriptList();
      } else { setConsole("Ошибка", j.output || "unknown", "err"); }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  async function deleteScript() {
    if (busy || !curScript) { if (!curScript) showToast("Выбери скрипт", "err"); return; }
    if (!confirm("Удалить скрипт " + curScript + "?")) return;
    setBusy(true);
    try {
      const j = await jsonFetch("/cgi-bin/delete-script?name=" + encodeURIComponent(curScript), { method: "POST" });
      if (j.ok) {
        showToast("Удалён", "ok");
        curScript = null; code.value = ""; dirty = false; renderGutter();
        $("cfgPath").textContent = "";
        setConsole("Консоль", "Скрипт удалён.", "muted");
        loadScriptList();
      } else { setConsole("Ошибка", j.output || "unknown", "err"); }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  function newScript() {
    let name = prompt("Имя нового скрипта (.sh):", "10-my-hook.sh");
    if (!name) return;
    name = name.trim();
    if (!/\.sh$/.test(name)) name += ".sh";
    if (!/^[A-Za-z0-9._-]+$/.test(name)) { showToast("Недопустимое имя", "err"); return; }
    curScript = name;
    code.value = "#!/bin/sh\n# " + name + "\n\n";
    dirty = true;
    renderGutter();
    $("cfgPath").textContent = "/etc/mihomo/scripts/" + name + " (не сохранён)";
    setConsole("Новый скрипт", "Отредактируй и нажми «Сохранить».", "muted");
    code.focus();
  }

  /* ── view switching ─────────────────────────────────────── */
  function switchView(v) {
    if (v === view) return;
    if (dirty && !confirm("Изменения не сохранены. Переключить раздел?")) return;
    view = v;
    dirty = false;
    document.querySelectorAll(".nav-item").forEach((a) =>
      a.classList.toggle("active", a.dataset.view === v));
    const sh = v === "sh";
    $("actionsYaml").hidden = sh;
    $("actionsSh").hidden = !sh;
    $("filesPanel").hidden = !sh;
    $("viewTitle").textContent = sh ? "scripts/" : "config.yaml";
    $("consoleHint").textContent = sh
      ? "Ctrl+S — сохранить · Ctrl+Enter — проверить"
      : "Ctrl+S — применить · Ctrl+Enter — проверить";
    $("cfgPath").textContent = "";
    if (sh) {
      curScript = null; code.value = "";
      renderGutter();
      setConsole("Консоль", "Выбери скрипт слева или создай новый.", "muted");
      loadScriptList();
    } else {
      loadConfig();
      refreshStatus();
    }
  }

  /* ── bindings ───────────────────────────────────────────── */
  document.querySelectorAll(".nav-item").forEach((a) =>
    a.addEventListener("click", () => switchView(a.dataset.view)));

  $("validateBtn").addEventListener("click", validate);
  $("applyBtn").addEventListener("click", apply);
  $("reloadBtn").addEventListener("click", () => {
    if (dirty && !confirm("Изменения не сохранены. Сбросить и перечитать с диска?")) return;
    loadConfig();
  });

  $("shSaveBtn").addEventListener("click", saveScript);
  $("shCheckBtn").addEventListener("click", validateScript);
  $("shRunBtn").addEventListener("click", runScript);
  $("shToggleBtn").addEventListener("click", toggleScript);
  $("shDeleteBtn").addEventListener("click", deleteScript);
  $("shNewBtn").addEventListener("click", newScript);
  $("shReloadBtn").addEventListener("click", () => {
    if (!curScript) { loadScriptList(); return; }
    if (dirty && !confirm("Изменения не сохранены. Перечитать с диска?")) return;
    openScript(curScript);
  });

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "s") { e.preventDefault(); view === "sh" ? saveScript() : apply(); }
    else if (e.key === "Enter") { e.preventDefault(); view === "sh" ? validateScript() : validate(); }
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ── init ───────────────────────────────────────────────── */
  renderGutter();
  loadConfig();
  refreshStatus();
  setInterval(refreshStatus, 7000);
})();
