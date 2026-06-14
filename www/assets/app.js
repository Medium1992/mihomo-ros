/* ── mihomo-ros web UI ─────────────────────────────────────── */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const code = $("code");
  const gutter = $("gutter");
  const consoleBody = $("consoleBody");
  const consoleTitle = $("consoleTitle");
  const toast = $("toast");

  // resource descriptors for the file-manager views
  const RES = {
    "scripts": {
      kind: "sh", title: "Pre-скрипты", dir: "scripts",
      hint: "<code>/etc/mihomo/scripts/</code> · выполняются <b>до</b> старта mihomo",
      tpl: "#!/bin/sh\n# pre-start hook\n\n", newName: "10-hook.sh",
    },
    "scripts-post": {
      kind: "sh", title: "Post-скрипты", dir: "scripts-post",
      hint: "<code>/etc/mihomo/scripts-post/</code> · выполняются <b>после</b> старта mihomo",
      tpl: "#!/bin/sh\n# post-start hook\n\n", newName: "10-hook.sh",
    },
    "proxy-providers": {
      kind: "prov", title: "proxy-providers", dir: "proxy-providers",
      hint: "<code>/etc/mihomo/proxy-providers/</code> · файлы провайдеров прокси",
      doc: "https://wiki.metacubex.one/ru/config/proxy-providers/content/",
      tpl: "proxies:\n  - \n", newName: "my-sub.yaml",
    },
    "provider-rules": {
      kind: "prov", title: "provider-rules", dir: "provider-rules",
      hint: "<code>/etc/mihomo/provider-rules/</code> · файлы провайдеров правил",
      doc: "https://wiki.metacubex.one/ru/config/rule-providers/content/",
      tpl: "payload:\n  - \n", newName: "my-rules.yaml",
    },
  };

  let view = "yaml";        // "yaml" | <resource key>
  let dirty = false;
  let busy = false;
  let curFile = null;       // selected file (resource views)
  const store = {};         // per-view buffers

  // yaml: ОДИН мастер-текст; редактор показывает либо весь конфиг, либо срез
  // секции (по top-level ключу upstream). Правки среза вклеиваются обратно.
  let cfgFull = "";
  let cfgSel = null;        // null = весь конфиг; иначе id секции (ключ)
  let secBefore = "", secAfter = "";
  // разделы = top-level ключи mihomo (upstream). "general" — общие скаляры.
  // doc — ссылка на офиц. вики metacubex; note — краткое пояснение;
  // sample — пример (показывается в пустом разделе и в шпаргалке).
  const DOC = "https://wiki.metacubex.one/ru/config/";
  const SECTIONS = [
    { id: "general", label: "Общие", doc: DOC + "general/",
      note: "Базовые настройки: порты, режим, лог, RESTful-API ядра (external-controller).",
      sample: "mixed-port: 7890\nmode: rule\nlog-level: info" },
    { id: "dns", label: "DNS", doc: DOC + "dns/",
      note: "Встроенный DNS-сервер: fake-ip, nameserver-политики, фильтры.",
      sample: "dns:\n  enable: true\n  enhanced-mode: fake-ip\n  nameserver:\n    - https://1.1.1.1/dns-query" },
    { id: "sniffer", label: "Снифер", doc: DOC + "sniff/",
      note: "Определение домена из TLS/HTTP/QUIC для маршрутизации по доменам.",
      sample: "sniffer:\n  enable: true\n  sniff:\n    TLS:\n      ports: [443]" },
    { id: "tun", label: "TUN", doc: DOC + "inbound/tun/",
      note: "TUN-интерфейс для прозрачного перехвата всего трафика.",
      sample: "tun:\n  enable: true\n  stack: system\n  auto-route: true" },
    { id: "hosts", label: "Hosts", doc: DOC + "dns/",
      note: "Статические соответствия домен → IP (аналог /etc/hosts).",
      sample: "hosts:\n  router.lan: 192.168.1.1" },
    { id: "ntp", label: "NTP", doc: DOC + "ntp/",
      note: "Встроенный NTP-клиент ядра.",
      sample: "ntp:\n  enable: true\n  server: time.apple.com\n  port: 123" },
    { id: "proxies", label: "Прокси", doc: DOC + "proxies/",
      note: "Прокси-серверы, заданные вручную (ss, vmess, trojan, vless…).",
      sample: "proxies:\n  - name: my-node\n    type: ss\n    server: 1.2.3.4\n    port: 8388\n    cipher: aes-256-gcm\n    password: \"pwd\"" },
    { id: "proxy-groups", label: "Группы прокси", doc: DOC + "proxy-groups/",
      note: "Группы выбора/балансировки: select, url-test, fallback, load-balance.",
      sample: "proxy-groups:\n  - name: PROXY\n    type: select\n    proxies:\n      - DIRECT" },
    { id: "proxy-providers", label: "Провайдеры прокси", doc: DOC + "proxy-providers/",
      note: "Внешние подписки. Скачанные файлы кладутся в proxy-providers/.",
      sample: "proxy-providers:\n  my-sub:\n    type: http\n    url: \"https://example.com/sub\"\n    path: ./proxy-providers/my-sub.yaml\n    interval: 3600\n    health-check:\n      enable: true\n      url: https://www.gstatic.com/generate_204\n      interval: 300" },
    { id: "rules", label: "Правила", doc: DOC + "rules/",
      note: "Правила маршрутизации сверху вниз; последним обычно MATCH.",
      sample: "rules:\n  - GEOIP,private,DIRECT,no-resolve\n  - MATCH,PROXY" },
    { id: "rule-providers", label: "Провайдеры правил", doc: DOC + "rule-providers/",
      note: "Внешние наборы правил (RULE-SET). Файлы — в provider-rules/.",
      sample: "rule-providers:\n  ru-bundle:\n    type: http\n    behavior: domain\n    format: mrs\n    url: \"https://example.com/ru.mrs\"\n    path: ./provider-rules/ru-bundle.mrs\n    interval: 86400" },
    { id: "sub-rules", label: "Sub-rules", doc: DOC + "sub-rule/",
      note: "Именованные подгруппы правил, вызываемые из rules через SUB-RULE.",
      sample: "sub-rules:\n  my-group:\n    - DOMAIN-SUFFIX,example.com,DIRECT" },
    { id: "listeners", label: "Listeners", doc: DOC + "inbound/",
      note: "Дополнительные входящие порты/протоколы (inbound).",
      sample: "listeners:\n  - name: http-in\n    type: http\n    port: 8080\n    listen: 0.0.0.0" },
    { id: "profile", label: "Profile", doc: DOC + "general/",
      note: "Сохранение выбранной ноды и fake-ip между перезапусками (cache.db).",
      sample: "profile:\n  store-selected: true\n  store-fake-ip: true" },
    { id: "experimental", label: "Experimental", doc: DOC + "experimental/",
      note: "Экспериментальные опции ядра.",
      sample: "experimental:\n  quic-go-disable-gso: true" },
    { id: "tunnels", label: "Tunnels", doc: DOC + "tunnels/",
      note: "Статические туннели (port-forward): локальный порт → адрес через прокси.",
      sample: "tunnels:\n  - tcp/udp,127.0.0.1:6553,8.8.8.8:53,PROXY" },
  ];
  const BLOCK_KEYS = SECTIONS.filter((s) => s.id !== "general").map((s) => s.id);
  const secOf = (id) => SECTIONS.find((x) => x.id === id);
  const secLabel = (id) => { const s = secOf(id); return s ? s.label : id; };
  const secSample = (id) => { const s = secOf(id); return (s && s.sample) ? s.sample : id + ":"; };
  const secNote = (id) => { const s = secOf(id); return s ? s.note : ""; };
  const secDocUrl = (id) => { const s = secOf(id); return s ? s.doc : DOC; };

  const isRes = (v) => Object.prototype.hasOwnProperty.call(RES, v);

  /* ── gutter ─────────────────────────────────────────────── */
  function renderGutter() {
    const n = code.value.split("\n").length;
    let out = "";
    for (let i = 1; i <= n; i++) out += i + "\n";
    gutter.textContent = out;
  }
  const syncScroll = () => { gutter.scrollTop = code.scrollTop; };

  code.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) outdentLines();
      else if (multiLineSel()) indentLines();
      else document.execCommand("insertText", false, "  ");
    } else if (ctrl && e.key === "/") { e.preventDefault(); toggleComment(); }
    else if (ctrl && e.key === "]") { e.preventDefault(); indentLines(); }
    else if (ctrl && e.key === "[") { e.preventDefault(); outdentLines(); }
  });
  /* ── редактор: отступы и комментирование ────────────────── */
  const multiLineSel = () =>
    code.value.slice(code.selectionStart, code.selectionEnd).indexOf("\n") >= 0;
  function selLineRange() {
    const v = code.value, s = code.selectionStart;
    let e = code.selectionEnd;
    if (e > s && v[e - 1] === "\n") e--;                 // выделение до начала строки — её не берём
    const ls = v.lastIndexOf("\n", s - 1) + 1;
    let le = v.indexOf("\n", e); if (le === -1) le = v.length;
    return { ls, le };
  }
  function editLines(fn) {
    const v = code.value;
    const { ls, le } = selLineRange();
    const out = fn(v.slice(ls, le).split("\n")).join("\n");
    code.setSelectionRange(ls, le);
    document.execCommand("insertText", false, out);      // сохраняет undo и шлёт input
    code.setSelectionRange(ls, ls + out.length);
  }
  const indentLines = () => editLines((ls) => ls.map((l) => (l === "" ? l : "  " + l)));
  const outdentLines = () => editLines((ls) => ls.map((l) => l.replace(/^( {1,2}|\t)/, "")));
  function toggleComment() {
    editLines((ls) => {
      const ne = ls.filter((l) => l.trim() !== "");
      const allCom = ne.length > 0 && ne.every((l) => /^\s*#/.test(l));
      return allCom
        ? ls.map((l) => l.replace(/^(\s*)#\s?/, "$1"))
        : ls.map((l) => (l.trim() === "" ? l : l.replace(/^(\s*)/, "$1# ")));
    });
  }
  code.addEventListener("input", () => {
    dirty = true; renderGutter();
    if (view === "yaml") {
      if (cfgSel === null) cfgFull = code.value;
      else if (cfgSel === "general") cfgFull = rebuildFromGeneral(code.value);
      else cfgFull = spliceSection(code.value);
    }
  });
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
    const t = await r.text();
    try { return JSON.parse(t); }
    catch (_) {
      throw new Error("сервер вернул не JSON (HTTP " + r.status + "). "
        + "Возможно, CGI без +x — перезапусти контейнер. "
        + t.replace(/<[^>]*>/g, " ").trim().slice(0, 120));
    }
  }
  const txtPost = (body) => ({ method: "POST", headers: { "Content-Type": "text/plain" }, body });

  /* ── status badge ───────────────────────────────────────── */
  async function refreshStatus() {
    try {
      const j = await jsonFetch("/cgi-bin/status");
      $("statusDot").className = "dot " + (j.running ? "up" : "down");
      $("statusText").textContent = j.running ? "ядро запущено" : "ядро недоступно";
      $("version").textContent = j.version || "—";
      if (j.config && view === "yaml" && cfgSel === null) $("cfgPath").textContent = j.config;
    } catch (_) {
      $("statusDot").className = "dot down";
      $("statusText").textContent = "нет связи";
    }
  }

  /* ════════════════ YAML view ════════════════ */
  async function loadConfig() {
    try {
      const r = await fetch("/cgi-bin/get-config", { cache: "no-store" });
      // нормализуем хвост: один завершающий перевод строки, без пустых строк
      cfgFull = (await r.text()).replace(/[ \t\r\n]+$/, "") + "\n";
      dirty = false;
      buildSectionList();
      if (cfgSel !== null && sectionPresent(cfgSel)) selectSection(cfgSel);
      else selectWhole();
      setConsole("Консоль", "Конфиг загружен. Слева — разделы одного файла.", "muted");
    } catch (e) { setConsole("Ошибка", "Не удалось загрузить конфиг: " + e, "err"); }
  }

  // top-level ключи (колонка 0) с их блоками. Ведущие пустые строки и
  // комментарии В КОЛОНКЕ 0 прикрепляются к следующему ключу. Отступленные
  // строки (в т.ч. закомментированные `  # …`) — это содержимое предыдущего
  // блока и остаются с ним.
  function topEntries(text) {
    const lines = text.split("\n");
    const off = []; let o = 0;
    for (const l of lines) { off.push(o); o += l.length + 1; }
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^([A-Za-z0-9_-]+):/);
      if (!m) continue;
      let s = i;
      while (s - 1 >= 0 && (lines[s - 1].trim() === "" || lines[s - 1].charAt(0) === "#")) s--;
      entries.push({ key: m[1], start: off[s] });
    }
    for (let j = 0; j < entries.length; j++)
      entries[j].end = (j + 1 < entries.length) ? entries[j + 1].start : text.length;
    return entries;
  }
  const sliceTrim = (e) => cfgFull.slice(e.start, e.end).replace(/^\n+/, "").replace(/\n+$/, "");
  // {start,end} блок-секции (один top-level ключ) или null, если отсутствует
  function blockRange(id) {
    const e = topEntries(cfgFull).find((x) => x.key === id);
    return e ? { start: e.start, end: e.end } : null;
  }
  // «Общее» = ВСЕ top-level ключи, не относящиеся к другим вкладкам
  // (даже разбросанные по файлу), их тексты собираются вместе.
  const generalEntries = () => topEntries(cfgFull).filter((e) => !BLOCK_KEYS.includes(e.key));
  const generalText = () => generalEntries().map(sliceTrim).filter(Boolean).join("\n");
  const sectionPresent = (id) =>
    id === "general" ? generalEntries().length > 0 : blockRange(id) !== null;
  // пересобрать мастер-текст из отредактированного «Общего»: общие скаляры
  // сверху, затем блок-секции в прежнем порядке, по одной пустой строке между.
  function rebuildFromGeneral(body) {
    const blocks = topEntries(cfgFull).filter((e) => BLOCK_KEYS.includes(e.key)).map(sliceTrim);
    const parts = [];
    const g = body.replace(/^\n+/, "").replace(/\n+$/, "");
    if (g) parts.push(g);
    blocks.forEach((b) => { if (b) parts.push(b); });
    return parts.join("\n\n") + "\n";
  }

  function buildSectionList() {
    const ul = $("filesList"); ul.innerHTML = "";
    const whole = document.createElement("li");
    whole.className = "file-item sec-whole" + (cfgSel === null ? " sel" : "");
    whole.dataset.sec = "whole";
    whole.innerHTML = '<span class="file-name">Весь конфиг</span>';
    whole.addEventListener("click", selectWhole);
    ul.appendChild(whole);
    const sep = document.createElement("li"); sep.className = "files-sep"; ul.appendChild(sep);
    SECTIONS.forEach((s) => {
      const present = sectionPresent(s.id);
      const li = document.createElement("li");
      li.className = "file-item" + (present ? "" : " absent") + (cfgSel === s.id ? " sel" : "");
      li.dataset.sec = s.id;
      li.innerHTML = '<span class="file-name"></span><span class="file-tag">' + (present ? "" : "пусто") + "</span>";
      li.querySelector(".file-name").textContent = s.label;
      li.addEventListener("click", () => selectSection(s.id));
      ul.appendChild(li);
    });
  }
  function markYamlSel() {
    const cur = cfgSel === null ? "whole" : cfgSel;
    document.querySelectorAll("#filesList .file-item")
      .forEach((li) => li.classList.toggle("sel", li.dataset.sec === cur));
  }
  // строка-шпаргалка над редактором: примечание + ссылка на доку mihomo
  function renderSecDoc(id) {
    const bar = $("secDoc");
    if (!bar) return;
    if (id === null) {
      $("secDocNote").textContent = "Весь конфиг одним файлом. Слева — навигация по разделам.";
      $("secDocLink").href = DOC;
    } else {
      $("secDocNote").textContent = secNote(id);
      $("secDocLink").href = secDocUrl(id);
    }
    bar.hidden = false;
  }
  function selectWhole() {
    cfgSel = null;
    code.placeholder = "";
    code.value = cfgFull; renderGutter();
    $("cfgPath").textContent = "/etc/mihomo/config.yaml";
    renderSecDoc(null);
    markYamlSel();
  }
  const placeholderFor = (id) => "# раздел «" + secLabel(id) + "» пуст\n"
    + "# чтобы заполнить, начните со строки:\n" + secSample(id);
  function selectSection(id) {
    cfgSel = id;
    code.placeholder = "";
    if (id === "general") {
      // «Общее» собирается из всех не-блочных ключей; склейка — rebuildFromGeneral
      const t = generalText();
      code.value = t;
      if (!t) code.placeholder = placeholderFor(id);
    } else {
      const r = blockRange(id);
      if (r) {
        secBefore = cfgFull.slice(0, r.start);
        secAfter = cfgFull.slice(r.end);
        // ведущую пустую строку-разделитель не показываем (она в модели, не в виде)
        code.value = cfgFull.slice(r.start, r.end).replace(/^\n+/, "");
      } else {
        // раздела нет: пусто, ввод допишется в конец общего конфига
        secBefore = cfgFull.endsWith("\n") ? cfgFull : cfgFull + "\n";
        secAfter = "";
        code.value = "";
        code.placeholder = placeholderFor(id);
      }
    }
    renderGutter();
    $("cfgPath").textContent = "config.yaml › " + secLabel(id);
    renderSecDoc(id);
    markYamlSel();
  }
  // вклеиваем отредактированный срез обратно в мастер-текст с нормализацией
  // границ: ровно одна пустая строка между секциями, один \n в конце. Это
  // не даёт «съесть» разделитель и склеить секцию с соседней при правке
  // последней строки.
  function spliceSection(body) {
    const before = secBefore.replace(/\n+$/, "");
    const after = secAfter.replace(/^\n+/, "");
    const mid = body.replace(/^\n+/, "").replace(/\n+$/, "");
    const parts = [];
    if (before) parts.push(before);
    if (mid) parts.push(mid);
    if (after) parts.push(after);
    return parts.join("\n\n") + "\n";
  }

  async function validate() {
    if (busy) return;
    setBusy(true); setConsole("Проверка…", "Запускаю mihomo -t (весь конфиг) …", "muted");
    try {
      const j = await jsonFetch("/cgi-bin/validate", txtPost(cfgFull));
      if (j.ok) { setConsole("Проверка пройдена", j.output || "Конфиг валиден ✓", "ok"); showToast("Конфиг валиден ✓", "ok"); }
      else { setConsole("Ошибка валидации", j.output || "unknown error", "err"); showToast("Конфиг невалиден ✗", "err"); }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }
  async function apply(force) {
    if (busy) return;
    const hard = force === true;
    setBusy(true);
    setConsole("Применение…", hard
      ? "Проверка и ПОЛНАЯ перезагрузка (порты/листенеры/TUN)…"
      : "Проверка и мягкое горячее обновление ядра…", "muted");
    try {
      const j = await jsonFetch("/cgi-bin/save-config?force=" + (hard ? "true" : "false"), txtPost(cfgFull));
      if (j.ok) {
        dirty = false;
        setConsole("Применено", hard
          ? "Конфиг сохранён, выполнена полная перезагрузка ✓"
          : "Конфиг сохранён и мягко применён ✓", "ok");
        showToast("Конфиг применён ✓", "ok"); refreshStatus();
      } else {
        const stage = j.stage === "apply" ? "Сохранён, но перезагрузка не удалась" : "Ошибка валидации";
        setConsole(stage, j.output || "unknown error", "err"); showToast(stage, "err");
      }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  /* ════════════════ resource (file-manager) views ════════════════ */
  const res = () => RES[view];
  const qs = (extra) => "dir=" + encodeURIComponent(view) + (extra || "");

  async function loadFileList() {
    let list = [];
    try { list = await jsonFetch("/cgi-bin/list-files?" + qs()); } catch (_) {}
    const ul = $("filesList"); ul.innerHTML = "";
    if (!list.length) ul.innerHTML = '<li class="files-empty">пусто · создай файл</li>';
    list.forEach((it) => {
      const li = document.createElement("li");
      li.className = "file-item" + (it.enabled ? "" : " off") + (it.file === curFile ? " sel" : "");
      li.dataset.file = it.file;
      li.innerHTML = '<span class="file-dot"></span><span class="file-name"></span>'
        + '<span class="file-tag">' + (it.enabled ? "" : "выкл") + "</span>";
      li.querySelector(".file-name").textContent = it.name;
      li.addEventListener("click", () => openFile(it.file));
      ul.appendChild(li);
    });
  }
  function markSel() {
    document.querySelectorAll("#filesList .file-item")
      .forEach((li) => li.classList.toggle("sel", li.dataset.file === curFile));
  }

  async function openFile(file) {
    if (dirty && curFile && curFile !== file &&
        !confirm("Изменения не сохранены. Открыть другой файл?")) return;
    try {
      const r = await fetch("/cgi-bin/get-file?" + qs("&name=" + encodeURIComponent(file)), { cache: "no-store" });
      code.value = await r.text();
      curFile = file; dirty = false; renderGutter();
      $("cfgPath").textContent = "/etc/mihomo/" + res().dir + "/" + file;
      setResPath(file);
      setConsole("Файл", file, "muted"); markSel();
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
  }

  async function saveFile() {
    if (busy) return;
    if (!curFile) { showToast("Сначала создай или выбери файл", "err"); return; }
    setBusy(true);
    try {
      const j = await jsonFetch("/cgi-bin/save-file?" + qs("&name=" + encodeURIComponent(curFile)), txtPost(code.value));
      if (j.ok) { dirty = false; setConsole("Сохранено", curFile, "ok"); showToast("Сохранено ✓", "ok"); loadFileList(); }
      else { setConsole("Ошибка", j.output || "unknown", "err"); showToast("Не сохранено ✗", "err"); }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  async function validateFile() {
    if (busy) return;
    if (!curFile) { showToast("Выбери или создай файл", "err"); return; }
    setBusy(true);
    setConsole("Проверка…", res().kind === "sh" ? "Запускаю sh -n …" : "Проверяю через mihomo …", "muted");
    try {
      const j = await jsonFetch("/cgi-bin/validate-file?" + qs("&name=" + encodeURIComponent(curFile)), txtPost(code.value));
      if (j.ok) { setConsole("Проверка пройдена", j.output || "OK ✓", "ok"); showToast("Проверка пройдена ✓", "ok"); }
      else { setConsole("Ошибка проверки", j.output || "unknown error", "err"); showToast("Не прошло ✗", "err"); }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  async function runFile() {
    if (busy || !curFile) { if (!curFile) showToast("Выбери скрипт", "err"); return; }
    if (dirty && !confirm("Скрипт не сохранён — запустить версию с диска?")) return;
    setBusy(true); setConsole("Запуск…", "Выполняю " + curFile + " …", "muted");
    try {
      const j = await jsonFetch("/cgi-bin/run-file?" + qs("&name=" + encodeURIComponent(curFile)), { method: "POST" });
      setConsole(j.ok ? "Готово ✓" : "Скрипт завершился с ошибкой", j.output || "(нет вывода)", j.ok ? "ok" : "err");
      showToast(j.ok ? "Выполнено ✓" : "Ошибка ✗", j.ok ? "ok" : "err");
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  async function toggleFile() {
    if (busy || !curFile) { if (!curFile) showToast("Выбери скрипт", "err"); return; }
    setBusy(true);
    try {
      const j = await jsonFetch("/cgi-bin/toggle-file?" + qs("&name=" + encodeURIComponent(curFile)), { method: "POST" });
      if (j.ok) {
        curFile = j.file;
        setConsole("Скрипт", (j.enabled ? "включён: " : "выключен: ") + j.file, "ok");
        showToast(j.enabled ? "Включён ✓" : "Выключен", "ok");
        $("cfgPath").textContent = "/etc/mihomo/" + res().dir + "/" + j.file;
        loadFileList();
      } else { setConsole("Ошибка", j.output || "unknown", "err"); }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  async function deleteFile() {
    if (busy || !curFile) { if (!curFile) showToast("Выбери файл", "err"); return; }
    if (!confirm("Удалить " + curFile + "?")) return;
    setBusy(true);
    try {
      const j = await jsonFetch("/cgi-bin/delete-file?" + qs("&name=" + encodeURIComponent(curFile)), { method: "POST" });
      if (j.ok) {
        showToast("Удалён", "ok");
        curFile = null; code.value = ""; dirty = false; renderGutter();
        $("cfgPath").textContent = ""; setResPath(null);
        setConsole("Консоль", "Файл удалён.", "muted"); loadFileList();
      } else { setConsole("Ошибка", j.output || "unknown", "err"); }
    } catch (e) { setConsole("Ошибка", String(e), "err"); }
    finally { setBusy(false); }
  }

  function newFile() {
    const r = res();
    let name = prompt("Имя нового файла:", r.newName);
    if (!name) return;
    name = name.trim();
    if (!/^[A-Za-z0-9._-]+$/.test(name)) { showToast("Недопустимое имя", "err"); return; }
    if (r.kind === "sh" && !/\.sh$/.test(name)) name += ".sh";
    curFile = name;
    code.value = r.tpl;
    dirty = true; renderGutter();
    $("cfgPath").textContent = "/etc/mihomo/" + r.dir + "/" + name + " (не сохранён)";
    setResPath(name);
    setConsole("Новый файл", "Отредактируй и нажми «Сохранить».", "muted");
    code.focus();
  }
  // строка с путём для вставки в конфиг (только proxy-providers / provider-rules)
  function setResPath(file) {
    const bar = $("resPath");
    if (isRes(view) && RES[view].kind === "prov" && file) {
      $("resPathText").textContent = "./" + RES[view].dir + "/" + file;
      bar.hidden = false;
    } else {
      bar.hidden = true;
    }
  }

  /* ── view switching ─────────────────────────────────────── */
  function snapshot() {
    if (view === "yaml") store.yaml = { full: cfgFull, sel: cfgSel, dirty };
    else store[view] = { text: code.value, dirty, cfgPath: $("cfgPath").textContent, curFile };
  }
  function applyChrome(v) {
    const yaml = v === "yaml";
    const tools = v === "tools";
    const kind = isRes(v) ? RES[v].kind : null;
    document.querySelectorAll(".nav-item").forEach((a) => a.classList.toggle("active", a.dataset.view === v));
    $("actionsYaml").hidden = !yaml;
    $("actionsScript").hidden = kind !== "sh";
    $("actionsProvider").hidden = kind !== "prov";
    $("filesPanel").hidden = false;       // колонка видна всегда
    $("newBtn").hidden = yaml || tools;   // у конфига и инструментов нет «новый»
    $("editorWrap").hidden = tools;       // у инструментов своя панель вместо редактора
    $("console").hidden = tools;
    $("toolsPane").hidden = !tools;
    $("resPath").hidden = true;           // строка пути покажется при выборе файла
    // верхняя строка-шпаргалка: для конфига — по разделам (renderSecDoc),
    // для proxy-providers/provider-rules — ссылка на доку, иначе скрыта
    const prov = kind === "prov";
    if (prov) {
      $("secDocNote").textContent = "Какие файлы можно создавать и чем их наполнять — в документации mihomo.";
      $("secDocLink").href = RES[v].doc;
      $("secDoc").hidden = false;
    } else {
      $("secDoc").hidden = !yaml;          // yaml: контент ставит renderSecDoc
    }
    const title = yaml ? "config.yaml" : tools ? "Инструменты" : RES[v].title;
    $("viewTitle").textContent = title;
    $("filesTitle").textContent = title;
    $("filesHint").innerHTML = yaml ? "разделы одного файла" : tools ? "" : RES[v].hint;
    $("consoleHint").textContent = (yaml ? "Ctrl+S применить · Ctrl+Enter проверить" : "Ctrl+S сохранить · Ctrl+Enter проверить")
      + " · Ctrl+/ коммент · Ctrl+]/[ отступ";
  }
  function switchView(v) {
    if (v === view) return;
    snapshot();
    view = v;
    applyChrome(v);

    const yaml = v === "yaml";
    const tools = v === "tools";
    const s = store[v];
    if (yaml) {
      if (s) {
        cfgFull = s.full; cfgSel = s.sel; dirty = s.dirty;
        buildSectionList();
        (cfgSel !== null && sectionPresent(cfgSel)) ? selectSection(cfgSel) : selectWhole();
        refreshStatus();
      } else { cfgSel = null; loadConfig(); refreshStatus(); }
    } else if (tools) {
      buildToolsList();
      selectTool(curTool);
    } else if (s) {
      code.value = s.text; dirty = s.dirty; curFile = s.curFile || null;
      $("cfgPath").textContent = s.cfgPath || "";
      renderGutter(); setResPath(curFile); loadFileList();
    } else {
      dirty = false; curFile = null; $("cfgPath").textContent = "";
      code.value = ""; renderGutter(); setResPath(null);
      setConsole("Консоль", "Выбери файл слева или создай новый.", "muted");
      loadFileList();
    }
  }

  /* ════════════════ tools view ════════════════ */
  const TOOLS = [
    { id: "hash", label: "Хеш-пароль", card: "toolHash" },
    { id: "awg", label: "AWG → YAML", card: "toolAwg" },
    { id: "toml", label: "TOML → YAML", card: "toolToml" },
    { id: "openvpn", label: "OpenVPN → YAML", card: "toolOpenvpn" },
  ];
  let curTool = "hash";
  function buildToolsList() {
    const ul = $("filesList"); ul.innerHTML = "";
    TOOLS.forEach((t) => {
      const li = document.createElement("li");
      li.className = "file-item" + (t.id === curTool ? " sel" : "");
      li.dataset.tool = t.id;
      li.innerHTML = '<span class="file-name"></span>';
      li.querySelector(".file-name").textContent = t.label;
      li.addEventListener("click", () => selectTool(t.id));
      ul.appendChild(li);
    });
  }
  function selectTool(id) {
    curTool = id;
    TOOLS.forEach((t) => { $(t.card).hidden = (t.id !== id); });
    document.querySelectorAll("#filesList .file-item")
      .forEach((li) => li.classList.toggle("sel", li.dataset.tool === id));
  }
  async function genHash() {
    const pwd = $("hashPwd").value;
    if (!pwd) { showToast("Введите пароль", "err"); return; }
    setBusy(true);
    try {
      const j = await jsonFetch("/cgi-bin/gen-hash", txtPost(pwd));
      if (j.ok) { $("hashOut").value = j.hash; showToast("Хеш готов ✓", "ok"); }
      else { showToast(j.output || "ошибка", "err"); }
    } catch (e) { showToast(String(e), "err"); }
    finally { setBusy(false); }
  }
  // конвертеры конфигов (AWG / TrustTunnel toml / OpenVPN) -> proxies YAML
  async function runConvert(kind, inId, outId, btnId) {
    const body = $(inId).value.trim();
    if (!body) { showToast("Вставьте конфиг", "err"); return; }
    const btn = $(btnId); if (btn) btn.disabled = true;
    try {
      const j = await jsonFetch("/cgi-bin/convert?kind=" + encodeURIComponent(kind), txtPost(body));
      if (j.ok) { $(outId).value = j.output; showToast("Готово ✓", "ok"); }
      else { $(outId).value = ""; showToast(j.output || "не распознано", "err"); }
    } catch (e) { showToast(String(e), "err"); }
    finally { if (btn) btn.disabled = false; }
  }
  function copyField(id) {
    const el = $(id); if (!el || !el.value) return;
    el.select();
    if (navigator.clipboard) navigator.clipboard.writeText(el.value);
    else document.execCommand("copy");
    showToast("Скопировано", "ok");
  }

  /* ── bindings ───────────────────────────────────────────── */
  document.querySelectorAll(".nav-item").forEach((a) =>
    a.addEventListener("click", () => switchView(a.dataset.view)));

  $("validateBtn").addEventListener("click", validate);
  $("applyBtn").addEventListener("click", () => apply(false));
  $("applyFullBtn").addEventListener("click", () => {
    if (!confirm("Полная перезагрузка пересоздаёт порты/листенеры/TUN и разорвёт текущие соединения. Продолжить?")) return;
    apply(true);
  });
  $("reloadBtn").addEventListener("click", () => {
    if (dirty && !confirm("Изменения не сохранены. Сбросить и перечитать с диска?")) return;
    loadConfig();
  });

  // resource actions (both script & provider button groups call the same fns)
  const reload = () => {
    if (!curFile) { loadFileList(); return; }
    if (dirty && !confirm("Изменения не сохранены. Перечитать с диска?")) return;
    openFile(curFile);
  };
  $("scrReloadBtn").addEventListener("click", reload);
  $("scrCheckBtn").addEventListener("click", validateFile);
  $("scrRunBtn").addEventListener("click", runFile);
  $("scrToggleBtn").addEventListener("click", toggleFile);
  $("scrDeleteBtn").addEventListener("click", deleteFile);
  $("scrSaveBtn").addEventListener("click", saveFile);
  $("prvReloadBtn").addEventListener("click", reload);
  $("prvCheckBtn").addEventListener("click", validateFile);
  $("prvDeleteBtn").addEventListener("click", deleteFile);
  $("prvSaveBtn").addEventListener("click", saveFile);
  $("newBtn").addEventListener("click", newFile);
  $("resPathCopy").addEventListener("click", () => {
    const t = $("resPathText").textContent; if (!t) return;
    if (navigator.clipboard) navigator.clipboard.writeText(t);
    showToast("Путь скопирован", "ok");
  });
  $("hashGen").addEventListener("click", genHash);
  $("hashCopy").addEventListener("click", () => copyField("hashOut"));
  $("awgGen").addEventListener("click", () => runConvert("awg", "awgIn", "awgOut", "awgGen"));
  $("awgCopy").addEventListener("click", () => copyField("awgOut"));
  $("tomlGen").addEventListener("click", () => runConvert("toml", "tomlIn", "tomlOut", "tomlGen"));
  $("tomlCopy").addEventListener("click", () => copyField("tomlOut"));
  $("ovpnGen").addEventListener("click", () => runConvert("openvpn", "ovpnIn", "ovpnOut", "ovpnGen"));
  $("ovpnCopy").addEventListener("click", () => copyField("ovpnOut"));

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "s") { e.preventDefault(); view === "yaml" ? apply() : saveFile(); }
    else if (e.key === "Enter") { e.preventDefault(); view === "yaml" ? validate() : validateFile(); }
  });
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ── init ───────────────────────────────────────────────── */
  applyChrome("yaml");      // показать колонку разделов для конфига
  renderGutter();
  loadConfig();
  refreshStatus();
  setInterval(refreshStatus, 7000);
})();
