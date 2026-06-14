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
#    2) прогон пользовательских скриптов из /etc/mihomo/scripts/
#    3) basic auth для вебки
#    4) старт mihomo под супервизором (вторичен, авто-перезапуск)
#    5) старт веб-панели (httpd) — контейнер живёт, пока жива вебка
# ─────────────────────────────────────────────────────────────
set -u

log() { echo "[$(date +'%H:%M:%S')] $*"; }

# фиксированные пути/порты — внутренние, не настраиваются через env
MIHOMO_DIR="/etc/mihomo"
WEB_ROOT="/www"
WEB_PORT="80"
CONFIG="$MIHOMO_DIR/config.yaml"
HTTPD_CONF="/etc/httpd.conf"
SCRIPTS_DIR="$MIHOMO_DIR/scripts"

# единственные настраиваемые переменные — basic auth вебки
BASIC_AUTH_USER="${BASIC_AUTH_USER:-}"
BASIC_AUTH_PASS="${BASIC_AUTH_PASS:-}"

# ---- 1. folders + seed config --------------------------------
mkdir -p "$SCRIPTS_DIR" \
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

# ---- 2. user scripts from scripts/ ---------------------------
if [ -d "$SCRIPTS_DIR" ] && [ -n "$(ls -A "$SCRIPTS_DIR" 2>/dev/null)" ]; then
  for script in "$SCRIPTS_DIR"/*.sh; do
    [ -f "$script" ] || continue
    log "running script: $script"
    /bin/sh "$script" || log "script $script exited with $?"
  done
else
  log "no scripts in $SCRIPTS_DIR/ (mount your *.sh there to run at start)"
fi

# ---- 3. basic auth for the web UI ----------------------------
# busybox httpd reads auth from httpd.conf: "/:user:pass" guards the whole site.
: > "$HTTPD_CONF"
if [ -n "$BASIC_AUTH_USER" ] && [ -n "$BASIC_AUTH_PASS" ]; then
  if command -v openssl >/dev/null 2>&1; then
    echo "/:$BASIC_AUTH_USER:$(openssl passwd -1 "$BASIC_AUTH_PASS")" >> "$HTTPD_CONF"
  else
    echo "/:$BASIC_AUTH_USER:$BASIC_AUTH_PASS" >> "$HTTPD_CONF"
  fi
  log "basic auth enabled for user '$BASIC_AUTH_USER'"
else
  log "basic auth DISABLED (set BASIC_AUTH_USER / BASIC_AUTH_PASS)"
fi

# ---- graceful shutdown: take down the whole process group ----
trap 'log "stopping..."; kill 0 2>/dev/null; exit 0' TERM INT

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

# ---- 5. web UI (foundation) ----------------------------------
log "starting web UI on :$WEB_PORT (root $WEB_ROOT)"
httpd -f -p "$WEB_PORT" -h "$WEB_ROOT" -c "$HTTPD_CONF" &
HTTPD_PID=$!

# container lives as long as the web UI lives
wait "$HTTPD_PID"
log "web UI exited, shutting down"
kill 0 2>/dev/null
