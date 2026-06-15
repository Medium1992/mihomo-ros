#!/bin/sh
# Shared helpers for mihomo-ros CGI scripts.
# Paths/endpoint are self-contained here; nothing is required from the env.

MIHOMO_DIR="${MIHOMO_DIR:-/etc/mihomo}"
CONFIG="${CONFIG:-$MIHOMO_DIR/config.yaml}"
SCRIPTS_DIR="$MIHOMO_DIR/scripts"

# Endpoint и секрет берём прямо из живого config.yaml — единая точка истины
# (что сохранила вебка, то и используем). Читается в момент source: CGI,
# который перезаписывает конфиг (save-config), успевает прочитать секрет
# ещё работающего ядра до подмены — поэтому hot-reload не ловит 401.
_yaml() {
  sed -n "s/^$1:[[:space:]]*//p" "$CONFIG" 2>/dev/null | head -n1 \
    | sed -e 's/\r$//' -e 's/[[:space:]]*$//' \
          -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}
_ec="$(_yaml external-controller)"
API_HOST=127.0.0.1                                  # ядро всегда локально
API_PORT="${_ec##*:}"
{ [ -n "$API_PORT" ] && [ "$API_PORT" != "$_ec" ]; } || API_PORT=9090
API_SECRET="$(_yaml secret)"

# read the raw request body into stdout (CONTENT_LENGTH bytes)
read_body() {
  len="${CONTENT_LENGTH:-0}"
  [ "$len" -gt 0 ] 2>/dev/null && head -c "$len" || true
}

# escape stdin as a JSON string value (without surrounding quotes)
json_escape() {
  # strip ANSI escapes, then escape JSON specials, collapse newlines to \n
  sed 's/\x1b\[[0-9;]*m//g' \
    | awk 'BEGIN{ORS=""}
        { gsub(/\\/,"\\\\"); gsub(/"/,"\\\"");
          gsub(/\t/,"\\t"); gsub(/\r/,"");
          if (NR>1) printf "\\n";
          printf "%s", $0 }'
}

send_json() {
  printf 'Status: %s\r\n' "${1:-200 OK}"
  printf 'Content-Type: application/json; charset=utf-8\r\n'
  printf 'Cache-Control: no-store\r\n'
  printf '\r\n'
}

send_text() {
  printf 'Status: %s\r\n' "${1:-200 OK}"
  printf 'Content-Type: text/plain; charset=utf-8\r\n'
  printf 'Cache-Control: no-store\r\n'
  printf '\r\n'
}

# url-decode a string (stdin-free, arg in / stdout out)
urldecode() {
  printf '%b' "$(printf '%s' "$1" | sed 's/+/ /g; s/%\(..\)/\\x\1/g')"
}

# value of a query-string key, url-decoded ("" if absent)
query_get() {
  urldecode "$(printf '%s' "${QUERY_STRING:-}" | tr '&' '\n' \
                | sed -n "s/^$1=//p" | head -n1)"
}

# ── file resources (file managers) ───────────────────────────
# whitelist of resource keys -> directories under MIHOMO_DIR
res_dir() {
  case "$1" in
    scripts)         printf '%s' "$MIHOMO_DIR/scripts" ;;
    scripts-post)    printf '%s' "$MIHOMO_DIR/scripts-post" ;;
    proxy-providers) printf '%s' "$MIHOMO_DIR/proxy-providers" ;;
    provider-rules)  printf '%s' "$MIHOMO_DIR/provider-rules" ;;
    *) return 1 ;;
  esac
}

# allowed file extensions per resource kind
res_ext_ok() {
  case "$1" in
    scripts|scripts-post)
      case "$2" in *.sh | *.sh.disabled) return 0 ;; esac ;;
    proxy-providers|provider-rules)
      case "$2" in *.yaml | *.yml | *.list | *.txt | *.mrs) return 0 ;; esac ;;
  esac
  return 1
}

# resolve a safe path: dirkey + basename + ext check. prints path or returns 1.
res_path() {
  d="$(res_dir "$1")" || return 1
  name="$(basename "$2")"
  case "$name" in .* ) return 1 ;; esac   # no dotfiles / traversal leftovers
  res_ext_ok "$1" "$name" || return 1
  printf '%s/%s' "$d" "$name"
}

# минимальный HTTP-клиент для RESTful API mihomo поверх busybox nc (без curl).
# usage: api METHOD PATH [JSON_BODY]
#   печатает тело ответа в stdout; код возврата 0 только при HTTP 2xx.
api() {
  method="$1"; path="$2"; body="${3:-}"
  resp="$(
    {
      printf '%s %s HTTP/1.0\r\n' "$method" "$path"
      printf 'Host: %s\r\nConnection: close\r\n' "$API_HOST"
      [ -n "$API_SECRET" ] && printf 'Authorization: Bearer %s\r\n' "$API_SECRET"
      if [ -n "$body" ]; then
        printf 'Content-Type: application/json\r\nContent-Length: %s\r\n\r\n%s' \
          "$(printf '%s' "$body" | wc -c | tr -d ' ')" "$body"
      else
        printf '\r\n'
      fi
    } | nc -w 5 "$API_HOST" "$API_PORT" 2>/dev/null
  )"
  [ -n "$resp" ] || return 1
  # тело ответа = всё после первой пустой строки
  printf '%s' "$resp" | sed '1,/^\r\{0,1\}$/d'
  # статус из первой строки "HTTP/1.0 NNN ..."
  case "$(printf '%s\n' "$resp" | head -n1 | tr -d '\r' | awk '{print $2}')" in
    2*) return 0 ;;
    *)  return 1 ;;
  esac
}
