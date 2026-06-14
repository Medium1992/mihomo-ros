#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  Режим: Redirect(tcp) + TUN(udp) через iptables (legacy).
#  Единственный вариант для iptables (без tproxy): TCP -> `redir-in` (12345),
#  UDP уходит в TUN (`Meta`).
#  ВКЛЮЧЁН ПО УМОЛЧАНИЮ (на ядре без nf_tables). На nft-ядре упадёт на первой
#  команде iptables (нет бинаря) — это ожидаемо, работает nft-вариант.
#  POST: после старта ядра (TUN `Meta` появляется только тогда).
#  Порядок: iptables redirect -> policy-routing -> forward-фаервол В КОНЦЕ.
# ─────────────────────────────────────────────────────────────
set -e

IFACE="$(ip -o link show | awk -F': ' '/link\/ether/ {print $2}' | cut -d'@' -f1 | head -n1)"
IFACE_CIDR="$(ip -4 -o addr show dev "$IFACE" scope global | awk '{print $4; exit}')"
[ -n "$IFACE_CIDR" ] || IFACE_CIDR="127.0.0.1/32"
REDIR=12345; TUN=Meta; TUN_GW=100.64.0.1; RT=110

# === iptables: чистка + redirect tcp (если iptables нет — упадёт здесь, до роутинга) ===
iptables -F
iptables -t nat -F
iptables -t mangle -F
iptables -t nat -A PREROUTING -m addrtype --dst-type LOCAL -j RETURN
iptables -t nat -A PREROUTING -m addrtype ! --dst-type UNICAST -j RETURN
iptables -t nat -A PREROUTING -i "$IFACE" -d "$IFACE_CIDR" -j RETURN
iptables -t nat -A PREROUTING -i "$IFACE" -d 198.19.0.0/30 -j RETURN
iptables -t nat -A PREROUTING -i "$IFACE" -p tcp -j REDIRECT --to-ports $REDIR

# === policy routing: udp -> TUN (table 110); исключения -> main ===
i=0; while [ $i -lt 50 ]; do ip link show "$TUN" >/dev/null 2>&1 && break; i=$((i+1)); sleep 0.2; done
ip link show "$TUN" >/dev/null 2>&1 || { echo "[route] TUN $TUN не появился — проверь listener tun-in"; exit 1; }
for p in 10000 10001 10002 10003 10004 10005; do ip rule del pref $p 2>/dev/null || true; done
ip route flush table $RT 2>/dev/null || true
ip rule add iif "$IFACE" ipproto tcp lookup main priority 10000
ip rule add to $IFACE_CIDR lookup main priority 10001
ip rule add to 127.0.0.0/8 lookup main priority 10002
ip rule add to 224.0.0.0/4 lookup main priority 10003
ip rule add to 255.255.255.255 lookup main priority 10004
ip rule add iif "$IFACE" ipproto udp lookup $RT priority 10005
ip route replace default via $TUN_GW dev $TUN table $RT

# === forward-фаервол (в самом конце): дропаем ВЕСЬ форвард, кроме
#     established/related и udp, уходящего в TUN ===
iptables -P FORWARD DROP
iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED,UNTRACKED -j ACCEPT
iptables -A FORWARD -m conntrack --ctstate INVALID -j DROP
iptables -A FORWARD -i "$IFACE" -o "$TUN" -p udp -j ACCEPT
sysctl -w net.ipv4.ip_forward=1 2>/dev/null || true

echo "[route] iptables Redirect(tcp)->$REDIR + TUN(udp)->$TUN on $IFACE"
