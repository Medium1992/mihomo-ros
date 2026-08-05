#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  Guard для CGI, которые что-то меняют. Подключается ПОСЛЕ _lib.sh и ДО
#  любого вывода:   . /www/cgi-bin/_guard.sh  &&  guard_json
#
#  Файлы с именем на «_» — не эндпоинты: entrypoint не даёт им +x, поэтому
#  httpd не может их запустить, только CGI сорсят их изнутри.
#
#  Зачем. Панель закрыта basic auth, но HTTP-авторизация кешируется браузером
#  по origin'у и прикладывается к ЛЮБОМУ запросу на этот хост — в том числе к
#  <img src>, <form> и fetch(mode:'no-cors') с чужого сайта (SameSite защищает
#  куки, а не basic auth). Ответ атакующий не прочитает (CORS), но запись уже
#  произойдёт. Поэтому два барьера:
#
#   1) POST-only. busybox httpd запускает CGI и на GET, а значит без этой
#      проверки хватало бы <img src=".../delete-file?dir=scripts&name=x.sh">.
#   2) Referer совпадает с Host. Заголовок Origin busybox httpd в CGI НЕ
#      пробрасывает (список экспортируемых заголовков в нём фиксированный:
#      Host, Referer, Cookie, User-Agent, Auth…), поэтому опираемся на Referer:
#      свои же запросы его несут, сторонний сайт пришлёт либо чужой хост, либо
#      ничего — оба случая режутся.
#
#  Отключить проверку Referer (дёргать эндпоинты из своих скриптов/curl):
#    /container/envs/add list=mihomo-ros key=WEB_CSRF value=off
#  POST-only при этом остаётся — он не мешает нормальным клиентам.
# ─────────────────────────────────────────────────────────────

_method_ok() { [ "${REQUEST_METHOD:-GET}" = "POST" ]; }

_csrf_ok() {
  [ "${WEB_CSRF:-on}" = "off" ] && return 0
  _ref="${HTTP_REFERER:-}"
  _host="${HTTP_HOST:-}"
  [ -n "$_ref" ]  || return 1
  [ -n "$_host" ] || return 1
  _rest="${_ref#*://}"
  _refhost="${_rest%%/*}"
  # Host и Referer оба несут порт, если он не дефолтный — сравниваем как есть
  [ "$_refhost" = "$_host" ]
}

# JSON-эндпоинты: печатает готовый отказ и выходит. Вызывать ДО send_json.
guard_json() {
  if ! _method_ok; then
    send_json "405 Method Not Allowed"
    printf '{"ok":false,"output":"method not allowed: нужен POST"}'
    exit 0
  fi
  if ! _csrf_ok; then
    send_json "403 Forbidden"
    printf '{"ok":false,"output":"cross-origin request blocked (Referer)"}'
    exit 0
  fi
}

# То же для text/plain-эндпоинтов.
guard_text() {
  if ! _method_ok; then
    send_text "405 Method Not Allowed"; echo "method not allowed: нужен POST"; exit 0
  fi
  if ! _csrf_ok; then
    send_text "403 Forbidden"; echo "cross-origin request blocked (Referer)"; exit 0
  fi
}
