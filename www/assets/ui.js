/* ── ui.js: тост, диалоги, меню. Не знает ничего о логике панели. ── */
window.ui = (function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  function toast(text, kind) {
    const el = $("toast"); if (!el) return;
    el.textContent = text;
    el.className = "toast show " + (kind || "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.className = "toast"), 3200);
  }

  // один <dialog id="dlg"> на все подтверждения и ввод строки
  function open(o) {
    return new Promise((resolve) => {
      const d = $("dlg"), form = $("dlgForm"), input = $("dlgInput"), err = $("dlgErr");
      const isPrompt = !!o.prompt;
      $("dlgTitle").textContent = o.title || "";
      $("dlgText").textContent = o.text || "";
      $("dlgText").hidden = !o.text;
      $("dlgLabel").textContent = o.label || "";
      $("dlgField").hidden = !isPrompt;
      err.hidden = true; err.textContent = "";
      const ok = $("dlgOk");
      ok.textContent = o.okText || "OK";
      ok.classList.toggle("danger", !!o.danger);
      input.value = isPrompt ? (o.value || "") : "";
      let result = isPrompt ? null : false;
      const onSubmit = (e) => {
        if (isPrompt && o.validate) {
          const msg = o.validate(input.value);
          if (msg) { e.preventDefault(); err.textContent = msg; err.hidden = false; input.focus(); return; }
        }
        result = isPrompt ? input.value : true;
      };
      const onCancel = () => { result = isPrompt ? null : false; d.close(); };
      const onClose = () => {
        form.removeEventListener("submit", onSubmit);
        d.removeEventListener("close", onClose);
        $("dlgCancel").removeEventListener("click", onCancel);
        resolve(result);
      };
      form.addEventListener("submit", onSubmit);
      d.addEventListener("close", onClose);
      $("dlgCancel").addEventListener("click", onCancel);
      d.showModal();
      if (isPrompt) { input.focus(); input.select(); } else ok.focus();
    });
  }
  const confirm = (o) => open(Object.assign({}, o, { prompt: false }));
  const prompt = (o) => open(Object.assign({}, o, { prompt: true }));

  // выпадающее меню под якорем
  function menu(anchor, items) {
    closeMenu();
    const m = document.createElement("div");
    m.className = "menu"; m.setAttribute("role", "menu");
    items.forEach((it) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "menu-item" + (it.danger ? " danger" : "");
      b.setAttribute("role", "menuitem");
      b.innerHTML = '<span class="menu-label"></span><span class="menu-hint"></span>';
      b.querySelector(".menu-label").textContent = it.label;
      b.querySelector(".menu-hint").textContent = it.hint || "";
      b.addEventListener("click", () => { closeMenu(); it.onSelect && it.onSelect(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 4) + "px";
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8)) + "px";
    menu._el = m; menu._anchor = anchor;
    anchor.setAttribute("aria-expanded", "true");
    setTimeout(() => {
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onKey);
    }, 0);
    m.querySelector(".menu-item").focus();
  }
  function onDocClick(e) { if (menu._el && !menu._el.contains(e.target)) closeMenu(); }
  function onKey(e) {
    if (!menu._el) return;
    const items = [...menu._el.querySelectorAll(".menu-item")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") { const a = menu._anchor; closeMenu(); a && a.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  }
  function closeMenu() {
    if (!menu._el) return;
    menu._el.remove(); menu._el = null;
    if (menu._anchor) { menu._anchor.setAttribute("aria-expanded", "false"); menu._anchor = null; }
    document.removeEventListener("click", onDocClick);
    document.removeEventListener("keydown", onKey);
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise((res) => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove(); res();
    });
  }

  return { toast, confirm, prompt, menu, closeMenu, copy };
})();
