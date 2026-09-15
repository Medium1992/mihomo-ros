/* ── mihomo-ros: страница входа ─────────────────────────────── */
(function () {
  "use strict";
  if (window.top !== window.self) {
    document.documentElement.textContent = "mihomo-ros: страница не может быть открыта во фрейме";
    try { window.top.location = window.self.location; } catch { /* ignore */ }
    return;
  }
  const $ = (id) => document.getElementById(id);
  const form = $("loginForm"), user = $("loginUser"), pass = $("loginPass"), msg = $("loginMsg"), btn = $("loginBtn");
  $("loginHost").textContent = location.host;

  let timer = null;
  const setMsg = (text, kind) => { msg.textContent = text || ""; msg.className = "login-msg" + (kind ? " " + kind : ""); };
  const setDisabled = (b) => { user.disabled = b; pass.disabled = b; btn.disabled = b; };

  // 429: блокируем поля и ведём обратный отсчёт до следующей попытки
  function lock(seconds) {
    let left = Math.max(1, Math.ceil(seconds));
    setDisabled(true);
    clearInterval(timer);
    const tick = () => {
      if (left <= 0) { clearInterval(timer); timer = null; setDisabled(false); setMsg(""); pass.focus(); return; }
      setMsg("подождите " + left + " с", "err"); left--;
    };
    tick(); timer = setInterval(tick, 1000);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (user.disabled) return;
    const u = user.value, p = pass.value;
    if (!u || !p) { setMsg("login incorrect", "err"); (u ? pass : user).focus(); return; }
    setDisabled(true); setMsg("…");
    try {
      const r = await fetch("/cgi-bin/login", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "text/plain" }, body: u + "\n" + p,
      });
      let j = null; try { j = await r.json(); } catch { /* ignore */ }
      if (r.ok && j && j.ok) { location.replace("/"); return; }
      if (r.status === 429 && j && j.retryAfter) { lock(j.retryAfter); return; }
      setDisabled(false); pass.value = "";
      setMsg(r.status === 500 && j && j.output ? j.output : "login incorrect", "err");
      pass.focus();
    } catch {
      setDisabled(false); setMsg("нет связи с панелью", "err");
    }
  });
  (user.value ? pass : user).focus();
})();
