#!/bin/sh
# «/» без index.html в вебруте попадает сюда (busybox httpd: cgi-bin/index.cgi).
# Живая сессия или WEB_AUTH=off -> панель; иначе страница входа со статусом 401.
# Шаблоны лежат в /www (вне вебрута), поэтому без сессии их не получить.
AUTH_PUBLIC=1
. /www/cgi-bin/_lib.sh
WEB_SRC="${WEB_SRC:-/www}"

case "${REQUEST_METHOD:-GET}" in
  GET|HEAD) ;;
  *) send_text "405 Method Not Allowed"; echo "method not allowed"; exit 0 ;;
esac

page() {   # $1 статус, $2 файл
  printf 'Status: %s\r\n' "$1"
  printf 'Content-Type: text/html; charset=utf-8\r\n'
  printf 'Cache-Control: no-store\r\n'
  printf '\r\n'
  [ "${REQUEST_METHOD:-GET}" = "HEAD" ] || cat "$2"
}

if ! auth_required || session_current >/dev/null; then
  page "200 OK" "$WEB_SRC/index.html"
else
  page "401 Unauthorized" "$WEB_SRC/login.html"
fi
