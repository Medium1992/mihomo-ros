#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  Выбор backend файрвола по модулю ядра + установка пакета.
#  Перенос логики из mihomo-proxy-ros (entrypoint.sh).
#  Включён по умолчанию, выполняется ПЕРВЫМ (PRE).
#
#  Есть в ядре nf_tables -> nftables (iptables удаляется);
#  нет nf_tables       -> iptables-legacy.
#  Пакет ставится только если реально отсутствует (offline-safe).
# ─────────────────────────────────────────────────────────────

if ! lsmod | grep -q nf_tables; then
  if ! apk info -e iptables iptables-legacy >/dev/null 2>&1; then
    echo "[fw] нет nf_tables -> ставлю iptables-legacy"
    apk add --no-cache iptables iptables-legacy >/dev/null 2>&1 || true
    rm -f /usr/sbin/iptables /usr/sbin/iptables-save /usr/sbin/iptables-restore
    ln -sf /usr/sbin/iptables-legacy         /usr/sbin/iptables
    ln -sf /usr/sbin/iptables-legacy-save    /usr/sbin/iptables-save
    ln -sf /usr/sbin/iptables-legacy-restore /usr/sbin/iptables-restore
  fi
  echo "[fw] backend: iptables-legacy"
else
  if ! apk info -e nftables >/dev/null 2>&1; then
    echo "[fw] есть nf_tables -> ставлю nftables"
    apk add --no-cache nftables >/dev/null 2>&1 || true
  fi
  if apk info -e iptables iptables-legacy >/dev/null 2>&1; then
    echo "[fw] убираю iptables (используется nftables)"
    apk del iptables iptables-legacy >/dev/null 2>&1 || true
  fi
  echo "[fw] backend: nftables"
fi
