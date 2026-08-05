#!/bin/sh
# Guard для изменяющих CGI: . /www/cgi-bin/_guard.sh && guard_json
# POST-only + Referer == Host. Origin busybox httpd в CGI не пробрасывает.
# Basic auth от кросс-сайтовых запросов не спасает: браузер кеширует её по
# origin'у и прикладывает к чужим <img>/<form>/fetch.
# WEB_CSRF=off снимает проверку Referer (POST-only остаётся).

_method_ok() { [ "${REQUEST_METHOD:-GET}" = "POST" ]; }

_csrf_ok() {
  [ "${WEB_CSRF:-on}" = "off" ] && return 0
  _ref="${HTTP_REFERER:-}"
  _host="${HTTP_HOST:-}"
  [ -n "$_ref" ]  || return 1
  [ -n "$_host" ] || return 1
  _rest="${_ref#*://}"
  _refhost="${_rest%%/*}"
  [ "$_refhost" = "$_host" ]     # порт несут оба, сравниваем как есть
}

# вызывать ДО send_json
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

guard_text() {
  if ! _method_ok; then
    send_text "405 Method Not Allowed"; echo "method not allowed: нужен POST"; exit 0
  fi
  if ! _csrf_ok; then
    send_text "403 Forbidden"; echo "cross-origin request blocked (Referer)"; exit 0
  fi
}
