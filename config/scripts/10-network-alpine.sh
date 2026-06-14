#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  Сетевые настройки Alpine внутри контейнера (PRE, до старта ядра).
#  Включён по умолчанию. Без env: имена интерфейсов = имена veth в MikroTik,
#  шлюз вычисляется из существующего маршрута интерфейса (ничего не хардкодим).
#  Содержимое перенесено из mihomo-proxy-ros (entrypoint.sh).
# ─────────────────────────────────────────────────────────────

# базовые sysctl: форвардинг выкл (включат routing-скрипты при нужде), IPv6 off
sysctl -w net.ipv4.ip_forward=0
sysctl -w net.ipv6.conf.all.disable_ipv6=1
sysctl -w net.ipv6.conf.default.disable_ipv6=1
sysctl -w net.ipv6.conf.all.forwarding=0
sysctl -w net.ipv6.conf.default.forwarding=0
for f in /proc/sys/net/ipv6/conf/*/disable_ipv6; do
  echo 1 > "$f" 2>/dev/null || true
done

# conntrack-таймауты
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=86400
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_syn_sent=5
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_syn_recv=5
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_fin_wait=10
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_close_wait=10
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_last_ack=10
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_time_wait=10
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_close=10
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_unacknowledged=300
sysctl -w net.netfilter.nf_conntrack_udp_timeout_stream=180

# qdisc fq_codel + откл. multicast на всех ether-интерфейсах
for iface in $(ip -o link show up | awk -F': ' '/link\/ether/ {gsub(/@.*$/,"",$2); if($2!="lo") print $2}'); do
  tc qdisc add dev "$iface" root fq_codel >/dev/null 2>&1 || true
  ip link set dev "$iface" multicast off >/dev/null 2>&1 || true
done

# нормализация ip rule: убираем лишние правила, ставим стандартные приоритеты
for kw in unspec masquerade; do
  pref=$(ip rule show | awk "/lookup $kw/ {print \$1}" | tr -d :)
  [ -n "$pref" ] && ip rule del pref "$pref" 2>/dev/null || true
done
for kw in local main default; do
  pref=$(ip rule show | awk "/lookup $kw/ {print \$1}" | tr -d :)
  [ -n "$pref" ] && ip rule del pref "$pref" 2>/dev/null || true
done
ip rule add pref 0 lookup local
ip rule add pref 32766 lookup main
ip rule add pref 32767 lookup default

# дефолтный маршрут: шлюз вычисляется из kernel-route интерфейса
i=200
for iface in $(ip -o link show up | awk -F': ' '/link\/ether/ {gsub(/@.*$/,"",$2); if($2!="lo" && $2!~/^hs5t/ && $2!="Meta") print $2}'); do
  route_line=$(ip route list dev "$iface" proto kernel scope link | head -n1)
  [ -z "$route_line" ] && { i=$((i+1)); continue; }
  network=$(echo "$route_line" | awk '{print $1}')
  mask=$(echo "$network" | cut -d/ -f2)
  net_addr=$(echo "$network" | cut -d/ -f1)
  if [ "$mask" -eq 31 ] || [ "$mask" -eq 32 ]; then
    gw="$net_addr"
  else
    gw=$(echo "$net_addr" | awk -F. '{printf "%d.%d.%d.%d", $1, $2, $3, $4+1}')
  fi
  if [ "$i" -eq 200 ]; then
    ip route del default 2>/dev/null || true
    ip route replace default via "$gw" dev "$iface"
  else
    ip route replace default via "$gw" dev "$iface" table "$i"
    ip rule del table "$i" 2>/dev/null || true
    ip rule add fwmark "$i" table "$i" pref 150
  fi
  i=$((i+1))
done

echo "[net] sysctl + ip rules + default route ready"
