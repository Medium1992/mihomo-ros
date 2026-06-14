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

# resolve a safe path inside SCRIPTS_DIR from a requested name.
# basename-only + must end in .sh or .sh.disabled. prints path or returns 1.
script_path() {
  name="$(basename "$1")"
  case "$name" in
    .* ) return 1 ;;                 # no dotfiles / traversal leftovers
    *.sh | *.sh.disabled ) ;;
    * ) return 1 ;;
  esac
  printf '%s/%s' "$SCRIPTS_DIR" "$name"
}

# curl wrapper for the mihomo RESTful API, adds bearer secret if set
api() {
  method="$1"; path="$2"; shift 2
  if [ -n "$API_SECRET" ]; then
    curl -fsS -X "$method" "http://$API_HOST:$API_PORT$path" \
      -H "Authorization: Bearer $API_SECRET" "$@"
  else
    curl -fsS -X "$method" "http://$API_HOST:$API_PORT$path" "$@"
  fi
}
