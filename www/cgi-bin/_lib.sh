#!/bin/sh
# Shared helpers for mihomo-ros CGI scripts.
# Paths/endpoint are self-contained here; nothing is required from the env.

MIHOMO_DIR="${MIHOMO_DIR:-/etc/mihomo}"
CONFIG="${CONFIG:-$MIHOMO_DIR/config.yaml}"

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

# ── сессии веб-панели ─────────────────────────────────────────
# Вход по cookie sid=<64 hex>; сессия = файл $SESSION_DIR/<token> с именем
# пользователя внутри. Живёт SESSION_TTL_MIN минут без активности, каждый
# запрос продлевает (touch). Каталог создаёт entrypoint (0700, tmpfs).
SESSION_DIR="${SESSION_DIR:-/dev/shm/sessions}"
SESSION_TTL_MIN="${SESSION_TTL_MIN:-10080}"      # 7 дней

session_from_cookie() {
  _sid="$(printf '%s' "${HTTP_COOKIE:-}" | tr ';' '\n' | sed -n 's/^[[:space:]]*sid=//p' | head -n1 | tr -d ' \r')"
  case "$_sid" in ''|*[!0-9a-f]*) return 1 ;; esac
  [ "${#_sid}" -eq 64 ] || return 1
  printf '%s' "$_sid"
}

_session_age() {   # секунды с последней активности файла сессии
  _mt="$(stat -c %Y "$1" 2>/dev/null || echo 0)"
  echo $(( $(date +%s) - _mt ))
}

session_valid() {
  _f="$SESSION_DIR/$1"
  [ -f "$_f" ] || return 1
  if [ "$(_session_age "$_f")" -ge $((SESSION_TTL_MIN * 60)) ]; then rm -f "$_f"; return 1; fi
  touch "$_f" 2>/dev/null || true
  return 0
}

session_prune() {
  for _f in "$SESSION_DIR"/*; do
    [ -f "$_f" ] || continue
    [ "$(_session_age "$_f")" -ge $((SESSION_TTL_MIN * 60)) ] && rm -f "$_f"
  done
  return 0
}

session_create() {   # $1 user -> печатает токен
  mkdir -p "$SESSION_DIR" 2>/dev/null; chmod 700 "$SESSION_DIR" 2>/dev/null
  _t="$(openssl rand -hex 32 2>/dev/null)"
  [ "${#_t}" -eq 64 ] || _t="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  printf '%s\n' "$1" > "$SESSION_DIR/$_t" && chmod 600 "$SESSION_DIR/$_t"
  session_prune
  printf '%s' "$_t"
}

session_destroy() { [ -n "${1:-}" ] && rm -f "$SESSION_DIR/$1"; return 0; }

session_current() {
  _s="$(session_from_cookie)" || return 1
  session_valid "$_s" || return 1
  printf '%s' "$_s"
}

auth_required() { [ "${WEB_AUTH:-on}" != "off" ]; }

# 401 JSON и выход, если вход обязателен и сессии нет. Никакого
# WWW-Authenticate: иначе браузер покажет своё окно basic auth.
auth_enforce() {
  auth_required || return 0
  session_current >/dev/null && return 0
  send_json "401 Unauthorized"
  printf '{"ok":false,"auth":false,"output":"не авторизован"}'
  exit 0
}
# Публичные скрипты (index.cgi, login) ставят AUTH_PUBLIC=1 ДО source.
[ "${AUTH_PUBLIC:-0}" = "1" ] || auth_enforce
