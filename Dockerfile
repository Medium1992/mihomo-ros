FROM --platform=$BUILDPLATFORM alpine:latest AS package
ARG TARGETARCH
ARG TARGETVARIANT
ARG MIHOMO_VERSION=latest
ARG AMD64VERSION=v3
RUN apk add --no-cache curl jq gzip

RUN set -eu; \
    if [ "$MIHOMO_VERSION" = "latest" ]; then \
      API="https://api.github.com/repos/MetaCubeX/mihomo/releases/latest"; \
    else \
      API="https://api.github.com/repos/MetaCubeX/mihomo/releases/tags/${MIHOMO_VERSION}"; \
    fi; \
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


FROM alpine:latest
ARG TARGETARCH
ARG TARGETVARIANT

COPY --from=package /final /

RUN if [ "$TARGETARCH" = "arm64" ] || [ "$TARGETARCH" = "amd64" ]; then \
        apk add --no-cache ca-certificates busybox-extras openssl tzdata iproute2 nftables; \
    elif [ "$TARGETARCH" = "arm" ] && [ "$TARGETVARIANT" = "v7" ]; then \
        apk add --no-cache ca-certificates busybox-extras openssl tzdata iproute2 iptables iptables-legacy; \
    fi && \
    if ! ( [ "$TARGETARCH" = "arm" ] && [ "$TARGETVARIANT" = "v5" ] ); then \
    rm -f /usr/sbin/iptables /usr/sbin/iptables-save /usr/sbin/iptables-restore && \
    ln -s /usr/sbin/iptables-legacy /usr/sbin/iptables && \
    ln -s /usr/sbin/iptables-legacy-save /usr/sbin/iptables-save && \
    ln -s /usr/sbin/iptables-legacy-restore /usr/sbin/iptables-restore; \
    fi

ENTRYPOINT ["/entrypoint.sh"]
