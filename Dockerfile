FROM --platform=$BUILDPLATFORM alpine:latest AS package
ARG TARGETARCH
ARG TARGETVARIANT
ARG MIHOMO_VERSION=latest
ARG MIHOMO_CUSTOM_CORE=0
ARG MIHOMO_REPO=MetaCubeX/mihomo
ARG MIHOMO_CUSTOM_REPO=Medium1992/mihomo-proxy-ros
ARG AMD64VERSION=v3
RUN apk add --no-cache curl jq gzip

RUN set -eu; \
    if [ "$MIHOMO_CUSTOM_CORE" = "1" ]; then \
      RELEASE_REPO="$MIHOMO_CUSTOM_REPO"; \
    else \
      RELEASE_REPO="$MIHOMO_REPO"; \
    fi; \
    if [ "$MIHOMO_VERSION" = "latest" ]; then \
      API="https://api.github.com/repos/${RELEASE_REPO}/releases/latest"; \
    else \
      API="https://api.github.com/repos/${RELEASE_REPO}/releases/tags/${MIHOMO_VERSION}"; \
    fi; \
    echo "Using mihomo release repo: ${RELEASE_REPO}"; \
    REL="$(curl -fsSL "$API")"; \
    TAG="$(printf '%s' "$REL" | jq -r '.tag_name')"; \
    [ -n "$TAG" ] && [ "$TAG" != "null" ] || { echo "could not resolve release tag"; exit 1; }; \
    case "$TARGETARCH/$TARGETVARIANT" in \
      amd64/*)  asset="mihomo-linux-amd64-${AMD64VERSION}-${TAG}.gz" ;; \
      arm64/*)  asset="mihomo-linux-arm64-${TAG}.gz" ;; \
      arm/v7)   asset="mihomo-linux-armv7-${TAG}.gz" ;; \
      arm/v5)   asset="mihomo-linux-armv5-${TAG}.gz" ;; \
      *)        echo "unsupported target arch: ${TARGETARCH}/${TARGETVARIANT}"; exit 1 ;; \
    esac; \
    URL="$(printf '%s' "$REL" | jq -r --arg n "$asset" \
            '.assets[] | select(.name == $n) | .browser_download_url')"; \
    [ -n "$URL" ] || { echo "asset not found in release ${TAG}: $asset"; exit 1; }; \
    echo "Downloading: $URL"; \
    mkdir -p /final/usr/local/bin; \
    curl -fsSL "$URL" -o /tmp/mihomo.gz; \
    gunzip -c /tmp/mihomo.gz > /final/usr/local/bin/mihomo; \
    rm -f /tmp/mihomo.gz

RUN mkdir -p /final/etc/mihomo/scripts \
             /final/etc/mihomo/scripts-post \
             /final/etc/mihomo/proxy-providers \
             /final/etc/mihomo/provider-rules
COPY www/                /final/www/
COPY config/config.yaml  /final/etc/mihomo/config.yaml.default
COPY config/scripts/      /final/etc/mihomo/scripts/
COPY config/scripts-post/ /final/etc/mihomo/scripts-post/
COPY entrypoint.sh       /final/entrypoint.sh
RUN chmod +x /final/entrypoint.sh /final/usr/local/bin/mihomo /final/www/cgi-bin/*

# armv7/armv5 ходят только через iptables (nft там нет) — убираем nft-скрипты
# и скрипт выбора/установки backend (05-fw-modules: на этих сборках не нужен,
# а на armv5 ещё и apk отсутствует).
RUN if [ "$TARGETARCH" = "arm" ] && { [ "$TARGETVARIANT" = "v7" ] || [ "$TARGETVARIANT" = "v5" ]; }; then \
      rm -f /final/etc/mihomo/scripts/*nft*.sh* \
            /final/etc/mihomo/scripts-post/*nft*.sh* \
            /final/etc/mihomo/scripts/05-fw-modules.sh; \
    fi


# Базовые образы по платформам. У Alpine нет armv5 — для него берём scratch
# и распаковываем готовый Buildroot-rootfs (busybox httpd + iptables + openssl).
FROM --platform=linux/amd64  alpine:latest AS linux-amd64
FROM --platform=linux/arm64  alpine:latest AS linux-arm64
FROM --platform=linux/arm/v7 alpine:latest AS linux-armv7
FROM --platform=linux/arm/v5 scratch       AS linux-armv5
ADD rootfs.tar /

FROM ${TARGETOS}-${TARGETARCH}${TARGETVARIANT}
ARG TARGETARCH
ARG TARGETVARIANT

COPY --from=package /final /

# armv5 (Buildroot-rootfs) уже содержит нужные пакеты — apk там нет, пропускаем.
RUN if [ "$TARGETARCH" = "arm64" ] || [ "$TARGETARCH" = "amd64" ]; then \
        apk add --no-cache ca-certificates busybox-extras openssl tzdata iproute2 nftables; \
    elif [ "$TARGETARCH" = "arm" ] && [ "$TARGETVARIANT" = "v7" ]; then \
        apk add --no-cache ca-certificates busybox-extras openssl tzdata iproute2 iptables iptables-legacy; \
    fi && \
    if ( [ "$TARGETARCH" = "arm64" ] || [ "$TARGETARCH" = "amd64" ] || \
         ( [ "$TARGETARCH" = "arm" ] && [ "$TARGETVARIANT" = "v7" ] ) ); then \
    rm -f /usr/sbin/iptables /usr/sbin/iptables-save /usr/sbin/iptables-restore && \
    ln -s /usr/sbin/iptables-legacy /usr/sbin/iptables && \
    ln -s /usr/sbin/iptables-legacy-save /usr/sbin/iptables-save && \
    ln -s /usr/sbin/iptables-legacy-restore /usr/sbin/iptables-restore; \
    fi

ENTRYPOINT ["/entrypoint.sh"]
