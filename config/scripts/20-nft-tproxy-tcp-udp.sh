#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  Режим: TProxy(tcp+udp) через nftables. Весь форвард-трафик с входящего
#  интерфейса прозрачно заворачивается в листенер `tproxy-in` (12346).
#  PRE: можно сразу — TUN не нужен. Включи: переименуй в *.sh.
#  Порядок: сначала nft, потом policy-routing — если nft нет, выходим до роутинга.
# ─────────────────────────────────────────────────────────────
set -e

IFACE="$(ip -o link show | awk -F': ' '/link\/ether/ {print $2}' | cut -d'@' -f1 | head -n1)"
IFACE_CIDR="$(ip -4 -o addr show dev "$IFACE" scope global | awk '{print $4; exit}')"
[ -n "$IFACE_CIDR" ] || IFACE_CIDR="127.0.0.1/32"
PORT=12346; MARK=1; RT=100

# === nftables: чистка + правила (если nft нет — упадёт здесь, до роутинга) ===
nft delete table inet mihomo 2>/dev/null || true
nft add table inet mihomo
nft add chain inet mihomo pre "{ type filter hook prerouting priority filter; policy accept; }"
nft add rule inet mihomo pre meta iifname != "$IFACE" return
nft add rule inet mihomo pre tcp option mptcp exists drop
nft add rule inet mihomo pre ip daddr { $IFACE_CIDR, 127.0.0.0/8, 224.0.0.0/4, 255.255.255.255 } return
nft add rule inet mihomo pre meta l4proto { tcp, udp } meta mark set $MARK tproxy ip to 127.0.0.1:$PORT accept
nft add chain inet mihomo divert "{ type filter hook prerouting priority mangle -1; policy accept; }"
nft add rule inet mihomo divert meta l4proto { tcp, udp } socket transparent 1 meta mark set $MARK accept

# === policy routing: помеченное tproxy -> локальный lo ===
ip rule del fwmark $MARK table $RT 2>/dev/null || true
ip route flush table $RT 2>/dev/null || true
ip rule add fwmark $MARK table $RT pref 100
ip route replace local 0.0.0.0/0 dev lo table $RT

echo "[route] TProxy(tcp,udp) on $IFACE -> 127.0.0.1:$PORT"
