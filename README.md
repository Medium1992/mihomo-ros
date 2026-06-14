[English](/README.md) | [Русский](/README_RU.md) · [Telegram](https://t.me/+96HVPF3Ww6o3YTNi)

# mihomo-ros

> Multi-arch Docker container for **MikroTik RouterOS**: the [mihomo](https://github.com/MetaCubeX/mihomo) core plus a built-in **web panel on pure `busybox httpd` + sh CGI** (no Node.js) — a comfortable hand-editing YAML/sh workbench for people who write their mihomo config themselves.

[![GitHub release](https://img.shields.io/github/v/release/Medium1992/mihomo-ros?label=release)](https://github.com/Medium1992/mihomo-ros/releases)
[![License](https://img.shields.io/github/license/Medium1992/mihomo-ros)](./LICENSE)
![Platforms](https://img.shields.io/badge/arch-amd64%20%7C%20arm64%20%7C%20armv7-blue)
[![Telegram](https://img.shields.io/badge/Telegram-group-blue?logo=telegram)](https://t.me/+96HVPF3Ww6o3YTNi)

## ✨ Features

- 🧰 **Hand-editing workbench, not a wizard** — a fast YAML/sh editor for advanced users, not a form-based config builder
- 🖥 **Built-in WebUI** on port `80`, served by busybox httpd straight from the container — no CDN, works offline
- 🧩 **Section navigation in one file** — the YAML config is sliced by upstream top-level keys (General, DNS, Sniffer, Proxies, Proxy-groups, Rules, …); edit a slice or the whole file, single source of truth
- 📖 **Per-section mihomo docs** — every section shows a short note, an example, and a direct link to the official wiki
- ✅ **Live validation** — `mihomo -t` for the config & proxy-providers, `convert-ruleset` for rule-providers, `sh -n` for scripts, all on tmpfs
- 🪝 **Pre/Post hooks** — `scripts/` run before mihomo, `scripts-post/` after it comes up; run / enable / disable / delete from the UI
- 🗂 **File managers** for `proxy-providers/` and `provider-rules/` with create / validate / delete
- ⌨️ **Editor shortcuts** — `Ctrl+S` apply, `Ctrl+Enter` validate, `Ctrl+/` comment, `Ctrl+]`/`Ctrl+[` indent, `Tab`/`Shift+Tab` block indent
- 🔐 **Basic auth via password hash** — login + ready md5crypt hash in ENV; generate the hash on the **Tools** page
- 🛟 **Web panel is the foundation** — it stays up even if mihomo can't start on a broken config; a supervisor restarts the core every 5 s, so you can always fix the config in the UI
- 💾 **Zero flash wear** — the webroot runs from RAM (`/dev/shm`) and every temp/validation file lives in tmpfs

> Built for routers where the container root-dir is on FAT/USB/SMB (no Unix `+x` bit) — the CGI is copied into tmpfs and made executable at start.

## 🖥 WebUI

**`http://<container-ip>:80/`** — local management panel served by busybox httpd from the container itself.

It edits files on disk and applies the config through mihomo's RESTful API — no container restart needed.

**Pages:**

- **YAML config** — one file, navigable by section. The left column lists *Whole config* + every upstream section (`general`, `dns`, `sniffer`, `tun`, `hosts`, `ntp`, `proxies`, `proxy-groups`, `proxy-providers`, `rules`, `rule-providers`, `sub-rules`, `listeners`, `profile`, `experimental`, `tunnels`). *General* aggregates every top-level scalar that doesn't belong to another tab, even if scattered. Empty sections show a placeholder with a starter example.
- **Pre / Post scripts** — `sh` hooks with syntax check (`sh -n`), run-now, enable/disable (`.sh.disabled`), delete.
- **proxy-providers / provider-rules** — YAML/list/mrs file managers, validated with `mihomo -t` / `convert-ruleset`.
- **Tools** — generate the `BASIC_AUTH_HASH` md5crypt hash from a password.

**Editor:** line numbers, soft-tab (2 spaces), and shortcuts:

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Validate + save + hot-reload the core |
| `Ctrl+Enter` | Validate only (`mihomo -t`) |
| `Ctrl+/` | Toggle comment on line / selection |
| `Ctrl+]` / `Ctrl+[` | Indent / outdent |
| `Tab` / `Shift+Tab` | Indent / outdent block (multi-line selection) |

## ⚡ Quickstart (Docker)

```bash
docker run -d --name mihomo-ros \
  --network host --cap-add NET_ADMIN --cap-add NET_RAW \
  -e BASIC_AUTH_USER=admin \
  -e BASIC_AUTH_HASH='$1$mihomors$BipEGg3TOdgaQSFfGtisO1' \
  -v "$PWD/data:/etc/mihomo" \
  ghcr.io/medium1992/mihomo-ros:latest
# UI:  http://<router-ip>/        (default login admin / admin)
```

The default hash above is the hash of `admin` — change it via **Tools → Password hash**.
The core config lives in `./data` on the host and survives container re-creation.

## 🛠 RouterOS install

Enable container support first (RouterOS 7.20+):

```
/system/device-mode/print
/system/device-mode/update mode=advanced container=yes
```

Then create a veth, mount and container (adjust disk/addresses to your setup):

```routeros
/interface/veth/add name=veth-mihomo address=172.17.0.2/24 gateway=172.17.0.1
/ip/address/add address=172.17.0.1/24 interface=veth-mihomo

/container/config/set registry-url=https://ghcr.io tmpdir=usb1/pull
/container/mounts/add name=mihomo-data src=usb1/mihomo dst=/etc/mihomo
/container/envs/add name=mihomo-env key=BASIC_AUTH_USER value=admin
/container/envs/add name=mihomo-env key=BASIC_AUTH_HASH value="\$1\$mihomors\$BipEGg3TOdgaQSFfGtisO1"

/container/add remote-image=ghcr.io/medium1992/mihomo-ros:latest \
  interface=veth-mihomo root-dir=usb1/mihomo-root \
  mounts=mihomo-data envlist=mihomo-env logging=yes start-on-boot=yes
```

Then open `http://172.17.0.2/` and edit the config in the UI. Route LAN traffic to the container via mangle/routes as usual.

## 🔐 Environment variables

| ENV | Default | Description |
|---|---|---|
| `BASIC_AUTH_USER` | `admin` | Web panel login. Empty (with empty hash) = auth disabled. |
| `BASIC_AUTH_HASH` | hash of `admin` | **Ready md5crypt hash** (`$1$…`) of the password. Generate it on the **Tools** page. |

> The API port and secret are **not** ENVs — they're read from your `config.yaml` (`external-controller` / `secret`). The web panel applies changes through that controller.

## 📁 Layout

```
/usr/local/bin/mihomo            core (fetched in Dockerfile per arch)
/etc/mihomo/                     core working dir (-d)
  ├── config.yaml                active config
  ├── config.yaml.default        seeded on first run if config.yaml is missing
  ├── scripts/                   pre-start sh hooks
  ├── scripts-post/              post-start sh hooks
  ├── proxy-providers/           proxy provider files (.yaml)
  └── provider-rules/            rule provider files (.yaml/.list/.mrs)
/www/                            web panel (index.html + assets + cgi-bin)
/entrypoint.sh                   httpd-from-RAM + mihomo supervisor
```

## 🌍 Geo databases & extra files

Drop into `/etc/mihomo/` as needed: `geoip.metadb` / `geosite.dat` / `geoip.dat` / `GeoLite2-ASN.mmdb` (for `GEOIP`/`GEOSITE`/`IP-ASN` rules), a dashboard in `ui/` (+ `external-ui: ui`), and provider files in `proxy-providers/` and `provider-rules/` (including compiled `.mrs`). The runtime `cache.db` (fake-ip / selected node) is created automatically.

## 🐳 Architectures & build

`latest` is multi-arch: `amd64` (built as **v3**), `arm64`, `armv7`. For older x86 CPUs pull the `amd64v1` / `amd64v2` tags.

```bash
docker build -t mihomo-ros .                                  # amd64 = v3 by default
docker build --build-arg AMD64VERSION=v1 -t mihomo-ros:amd64v1 .
docker build --build-arg MIHOMO_VERSION=v1.19.27 -t mihomo-ros .
```

| `AMD64VERSION` | Instructions | CPU | Image tag |
|---|---|---|---|
| `v1` | baseline SSE2 | any x86-64 | `amd64v1` |
| `v2` | SSE3/SSSE3/SSE4.x | ~2009+ | `amd64v2` |
| `v3` (default) | AVX/AVX2/BMI | ~2015+, faster | `latest` |

## 💖 Support

- **USDT (TRC20):** `TWDDYD1nk5JnG6FxvEu2fyFqMCY9PcdEsJ`
- [boosty.to/petersolomon/donate](https://boosty.to/petersolomon/donate)
