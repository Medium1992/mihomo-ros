#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  mihomo-ros entrypoint
#
#  Веб-панель — ОСНОВА: busybox httpd должен работать всегда, даже если
#  mihomo не стартует (битый конфиг). Пользователь правит конфиг в вебке,
#  а mihomo поднимается супервизором сам, как только конфиг валиден.
#
#  Порядок:
#    1) подготовка рабочих папок + сид дефолтного конфига
#    2) PRE-скрипты из /etc/mihomo/scripts/      (до старта mihomo)
#    3) basic auth для вебки
#    4) старт mihomo под супервизором (вторичен, авто-перезапуск)
#    5) POST-скрипты из /etc/mihomo/scripts-post/ (после старта mihomo)
#    6) старт веб-панели (httpd) — контейнер живёт, пока жива вебка
# ─────────────────────────────────────────────────────────────
set -u

log() { echo "[$(date +'%H:%M:%S')] $*"; }

# фиксированные пути/порты — внутренние, не настраиваются через env
MIHOMO_DIR="/etc/mihomo"
WEB_ROOT="/www"
WEB_PORT="80"
CONFIG="$MIHOMO_DIR/config.yaml"
HTTPD_CONF="/etc/httpd.conf"
SCRIPTS_DIR="$MIHOMO_DIR/scripts"           # pre-start hooks
SCRIPTS_POST_DIR="$MIHOMO_DIR/scripts-post" # post-start hooks

# basic auth вебки: логин + ГОТОВЫЙ md5-хеш ($1$...) пароля.
# Хеш генерируется на странице «Инструменты» и кладётся в env BASIC_AUTH_HASH.
# По умолчанию: admin / хеш пароля "admin".
BASIC_AUTH_USER="${BASIC_AUTH_USER:-admin}"
BASIC_AUTH_HASH="${BASIC_AUTH_HASH:-\$1\$mihomors\$BipEGg3TOdgaQSFfGtisO1}"

# ---- 1. folders + seed config --------------------------------
mkdir -p "$SCRIPTS_DIR" "$SCRIPTS_POST_DIR" \
         "$MIHOMO_DIR/proxy-providers" \
         "$MIHOMO_DIR/provider-rules"

if [ ! -f "$CONFIG" ]; then
  if [ -f "$MIHOMO_DIR/config.yaml.default" ]; then
    log "config.yaml not found, seeding default"
    cp "$MIHOMO_DIR/config.yaml.default" "$CONFIG"
  else
    log "config.yaml not found and no default to seed — fix it in the web UI"
  fi
fi

# ---- script runner (skips *.sh.disabled) ---------------------
run_scripts() {
  dir="$1"; label="$2"
  [ -d "$dir" ] || return 0
  found=0
  for s in "$dir"/*.sh; do
    [ -f "$s" ] || continue
    found=1
    log "[$label] running $s"
    /bin/sh "$s" || log "[$label] $s exited with $?"
  done
  [ "$found" -eq 1 ] || log "[$label] no scripts in $dir/"
}

# переменные, доступные хук-скриптам (pre и post)
export MIHOMO_DIR CONFIG SCRIPTS_DIR SCRIPTS_POST_DIR

# ---- webroot в ОЗУ (/dev/shm/web) ----------------------------
# root-dir смонтирован по SMB — там не выставляется Unix +x, и busybox httpd
# не может запускать CGI (404/403/500). Поэтому копируем cgi-bin в tmpfs, где
# chmod реально работает, и запускаем httpd оттуда. Статика — симлинки на /www,
# так что её правки видны без рестарта. Правки CGI требуют рестарта контейнера.
build_webroot() {
  WEBROOT=/dev/shm/web
  # /dev/shm иногда смонтирован noexec — снимаем, чтобы httpd мог запускать CGI
  mount -o remount,exec /dev/shm 2>/dev/null || true
  rm -rf "$WEBROOT"
  mkdir -p "$WEBROOT"
  cp -r "$WEB_ROOT/cgi-bin" "$WEBROOT/cgi-bin"
  chmod +x "$WEBROOT/cgi-bin/"* 2>/dev/null || true
  for item in index.html assets; do
    [ -e "$WEB_ROOT/$item" ] && ln -sfn "$WEB_ROOT/$item" "$WEBROOT/$item"
  done
}
build_webroot

# ---- 2. PRE-start scripts (before mihomo) --------------------
run_scripts "$SCRIPTS_DIR" pre

# ---- 3. basic auth for the web UI ----------------------------
# busybox httpd reads auth from httpd.conf: "/:user:pass" guards the whole site.
: > "$HTTPD_CONF"
if [ -n "$BASIC_AUTH_USER" ] && [ -n "$BASIC_AUTH_HASH" ]; then
  # хеш уже готов ($1$...) — пишем как есть, без openssl
  echo "/:$BASIC_AUTH_USER:$BASIC_AUTH_HASH" >> "$HTTPD_CONF"
  log "basic auth enabled for user '$BASIC_AUTH_USER' (hash)"
else
  log "basic auth DISABLED (set BASIC_AUTH_USER / BASIC_AUTH_HASH)"
fi

# ---- fast shutdown ------------------------------------------
# Просто выходим из PID 1 — runtime сам SIGKILL'ит остальные процессы
# мгновенно. НЕ шлём mihomo SIGTERM (его graceful-shutdown долгий).
SHUTTING_DOWN=0
fast_shutdown() {
  trap - TERM INT
  [ "$SHUTTING_DOWN" = 1 ] && exit 0
  SHUTTING_DOWN=1
  log "stop signal received, exiting"
  exit 0
}
trap fast_shutdown TERM INT

# ---- 4. mihomo supervisor (secondary) ------------------------
# Никогда не роняет вебку. Если конфиг битый — mihomo падает, ждём и пробуем
# снова; как только в вебке сохранён валидный конфиг, следующий старт пройдёт.
mihomo_supervisor() {
  while true; do
    if [ -f "$CONFIG" ]; then
      log "starting mihomo ($(mihomo -v 2>/dev/null | head -n1))"
      mihomo -d "$MIHOMO_DIR" -f "$CONFIG"
      log "mihomo exited ($?) — fix the config in the web UI, retrying in 5s"
    else
      log "no config at $CONFIG yet — waiting (edit it in the web UI)"
    fi
    sleep 5
  done
}
mihomo_supervisor &

# ---- 5. POST-start scripts (after mihomo is up) --------------
# ждём появления процесса mihomo (до ~30с), даём ему секунду на инициализацию,
# затем один раз гоняем post-хуки. Не блокирует старт вебки.
post_runner() {
  i=0
  while [ "$i" -lt 30 ]; do
    pidof mihomo >/dev/null 2>&1 && break
    i=$((i + 1)); sleep 1
  done
  sleep 2
  run_scripts "$SCRIPTS_POST_DIR" post
}
post_runner &

# ---- 6. web UI (foundation) ----------------------------------
log "starting web UI on :$WEB_PORT (root $WEBROOT)"
httpd -f -p "$WEB_PORT" -h "$WEBROOT" -c "$HTTPD_CONF" &
HTTPD_PID=$!

# container lives as long as the web UI lives
wait "$HTTPD_PID"
log "web UI exited, shutting down"
exit 1
