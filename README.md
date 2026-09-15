[English](/README.md) | [Русский](/README_RU.md) · [Telegram](https://t.me/+96HVPF3Ww6o3YTNi)

# mihomo-ros

> Multi-arch Docker container for **MikroTik RouterOS**: the [mihomo](https://github.com/MetaCubeX/mihomo) core plus a built-in **web panel on pure `busybox httpd` + sh CGI** (no Node.js) — a comfortable all-in-one YAML/sh editor for people who write their mihomo config by hand.

[![Docker Pulls](https://img.shields.io/docker/pulls/medium1992/mihomo-ros?logo=docker&label=docker%20pulls)](https://hub.docker.com/r/medium1992/mihomo-ros)
[![Docker Image Size](https://img.shields.io/docker/image-size/medium1992/mihomo-ros/latest?logo=docker&label=image%20size)](https://hub.docker.com/r/medium1992/mihomo-ros)
[![License](https://img.shields.io/github/license/Medium1992/mihomo-ros)](./LICENSE)
![Platforms](https://img.shields.io/badge/arch-amd64%20%7C%20arm64%20%7C%20armv7%20%7C%20armv5-blue)
[![Telegram](https://img.shields.io/badge/Telegram-group-blue?logo=telegram)](https://t.me/+96HVPF3Ww6o3YTNi)

## ✨ Features

- 🧰 **All-in-one editor, not a wizard** — a fast YAML/sh editor for advanced users, not a form-based config builder
- 🖥 **Built-in WebUI** on port `80`, served by busybox httpd straight from the container — no CDN, works offline
- 🧩 **Section navigation in one file** — the YAML config is sliced by upstream top-level keys (General, DNS, Sniffer, Proxies, Proxy-groups, Rules, …); edit a slice or the whole file, single source of truth
- 📖 **Per-section mihomo docs** — every section shows a short note, an example, and a direct link to the official wiki
- ✅ **Live validation** — `mihomo -t` for the config & proxy-providers, `convert-ruleset` for rule-providers, `sh -n` for scripts, all on tmpfs
- 🪝 **Pre/Post hooks** — `scripts/` run before mihomo, `scripts-post/` after it comes up; validate / enable / disable / delete from the UI
- 🗂 **File managers** for `proxy-providers/` and `provider-rules/` with create / validate / delete
- 💾 **Import/export** — one file at a click, or the whole project as `.tar` or a JSON bundle; after a restore the UI re-reads its data without a page reload
- ⌨️ **Editor shortcuts** — `Ctrl+S` apply, `Ctrl+Enter` validate, `Ctrl+/` comment, `Ctrl+]`/`Ctrl+[` indent, `Tab`/`Shift+Tab` block indent
- 🔐 **Login page with a session cookie** — user + ready password hash in ENV, generate the hash on the **Tools** page; repeated wrong passwords lock the login for a while. Plus a CSRF guard on mutating requests
- 🛟 **Web panel is the foundation** — it stays up even if mihomo can't start on a broken config; a supervisor restarts the core every 5 s, so you can always fix the config in the UI
- 💾 **Zero flash wear** — the webroot runs from RAM (`/dev/shm`) and every temp/validation file lives in tmpfs

> Built for routers where the container root-dir is on FAT/USB/SMB (no Unix `+x` bit) — the CGI is copied into tmpfs and made executable at start.

## 🖥 WebUI

**`http://<container-ip>:80/`** — local management panel served by busybox httpd from the container itself.

It edits files on disk and applies the config through mihomo's RESTful API — no container restart needed.

> [!IMPORTANT]
> The panel asks for a login and password on its own page (no browser basic-auth prompt).
> **Default is `admin` / `admin` — change it.**
> *Tools → Password hash*: enter a new password, get the md5 hash, put it into the
> `WEB_PASSWORD_HASH` env. The plaintext password is never stored in env. While the default
> password is in use the panel shows a warning banner. The session lives in a cookie until you
> log out, after 7 idle days, or until the container restarts. See [Security](#-security).

<img width="1264" height="1268" alt="image" src="https://github.com/user-attachments/assets/c14355f8-57f2-4bb2-8535-24f1a22d6f1f" />

> The screenshot shows the previous look of the panel.

**Pages:**

- **YAML config** — one file, navigable by section. The left column lists *Whole config* + every upstream section (`general`, `dns`, `sniffer`, `tun`, `hosts`, `ntp`, `proxies`, `proxy-groups`, `proxy-providers`, `rules`, `rule-providers`, `sub-rules`, `listeners`, `profile`, `experimental`, `tunnels`). *General* aggregates every top-level scalar that doesn't belong to another tab, even if scattered. Empty sections show a placeholder with a starter example.
- **Pre / Post scripts** — `sh` hooks with syntax check (`sh -n`), enable/disable (`.sh.disabled`), delete. Edits take effect on container restart: running scripts from the UI is deliberately not supported (see [Security](#-security)).
- **proxy-providers / provider-rules** — YAML/list/mrs file managers, validated with `mihomo -t` / `convert-ruleset`. Binary `.mrs` files are not shown in the editor: the panel offers download, replace-from-disk and delete instead (upload them with the upload button).
- **Tools** — md5crypt hash for `WEB_PASSWORD_HASH`; converters for AmneziaWG/WireGuard `.conf` (including **AWG 3.0/3.1**), TrustTunnel `.toml` and OpenVPN `.ovpn` into a `proxies` block; backup and restore.

**Import / export.** The download / upload buttons in the file list header act on the open file: download it to disk, or load a file from disk into the editor (saving stays a separate, explicit step after validation). For the whole project use *Tools → Backup and restore*:

| Format | Contents | When |
|---|---|---|
| `.tar` | `config.yaml` + all 4 directories, binary `.mrs` included | full backup, opens in any archiver |
| `.json` | the same as one text file, binary `.mrs` base64-encoded | easy to read and hand-edit |

Restore overwrites files with matching names; `config.yaml` is applied last and **only if it passes `mihomo -t`**. Anything failing the directory/extension whitelist is skipped and listed in the log. After an import the panel re-reads its data on its own — no page reload.

> ⚠ A backup contains secrets in plaintext: the core `secret`, proxy passwords and keys. Treat it as carefully as `config.yaml` itself.

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
  -e WEB_USER=admin \
  -e WEB_PASSWORD_HASH='$1$mihomors$BipEGg3TOdgaQSFfGtisO1' \
  -v "$PWD/data:/etc/mihomo" \
  ghcr.io/medium1992/mihomo-ros:latest
# UI:  http://<router-ip>/        (default login admin / admin)
```

The default hash above is the hash of `admin` — change it via **Tools → Password hash**.
The core config lives in `./data` on the host and survives container re-creation.

## 🛠 RouterOS install

> ⚠️ Syntax below is for **RouterOS 7.21+** (mounts and envs are attached via **lists**: `mountlists` / `envlists`). On older releases the commands differ.

Enable container support first:

```
/system/device-mode/print
/system/device-mode/update mode=advanced container=yes
```

Then create a veth, mount/env lists and the container (adjust disk/addresses to your setup):

```routeros
/interface/veth/add name=veth-mihomo address=192.168.255.2/30 gateway=192.168.255.1
/ip/address/add address=192.168.255.1/30 interface=veth-mihomo

/container/config/set registry-url=https://ghcr.io tmpdir=usb1/pull

/container/mounts/add list=mihomo-ros src=usb1/mihomo dst=/etc/mihomo
/container/envs/add list=mihomo-ros key=WEB_USER value=admin
/container/envs/add list=mihomo-ros key=WEB_PASSWORD_HASH value="\$1\$mihomors\$BipEGg3TOdgaQSFfGtisO1"

/container/add remote-image=ghcr.io/medium1992/mihomo-ros:latest \
  interface=veth-mihomo root-dir=usb1/mihomo-root \
  mountlists=mihomo-ros envlists=mihomo-ros logging=yes start-on-boot=yes
```

Then open `http://192.168.255.2/` and edit the config in the UI. Route LAN traffic to the container via mangle/routes as usual.

## 🔐 Environment variables

Every ENV is about the web panel; the default login/password is `admin` / `admin`:

| ENV | Default | Description |
|---|---|---|
| `WEB_USER` | `admin` | Web panel login. The old name `BASIC_AUTH_USER` still works. |
| `WEB_PASSWORD_HASH` | `$1$mihomors$BipEGg3TOdgaQSFfGtisO1` (= hash of `admin`) | **Ready password hash**: `$1$` (md5crypt, generated on the **Tools** page), `$5$` or `$6$` (`openssl passwd -5` / `-6`). The old name `BASIC_AUTH_HASH` still works. An empty value means the default, not "no password". |
| `WEB_AUTH` | `on` | `off` deliberately opens the panel **with no password**. This is the only way to disable the login. The old name `BASIC_AUTH` still works. |
| `WEB_CSRF` | `on` | `Referer` check on mutating CGI requests. Set `off` if you call the panel's endpoints from your own scripts/curl. |

> Everything else lives in `config.yaml`, not in ENV. The API port and secret are read from it (`external-controller` / `secret`); routing/network is set up by the hook scripts in `scripts/` and `scripts-post/`.

## 🛡 Security

The panel edits `config.yaml` and `sh` scripts that the container runs **as root** on the router's network. So:

- **Change the default password.** While it is `admin` the panel shows a warning banner and the container logs a `WARNING`. Generate the hash in *Tools → Password hash*; only the hash goes into env. Forgot it? Delete the `WEB_PASSWORD_HASH` env and restart — it falls back to `admin`.
- **Login and sessions.** A CGI script checks the password against the hash from env; after login the browser gets a `sid` cookie (`HttpOnly`, `SameSite=Strict`, 7 idle days). Sessions live in the container's RAM and die with a restart — log in again afterwards. The "выйти" button in the status bar destroys the session. After 5 wrong passwords in a row the login is locked for 30 seconds, and every failure adds a delay of up to 3 seconds.
- **The panel runs over plain HTTP**: the password you type at login and into the hash generator travels the LAN in the clear. Never expose the container's port `80` to the internet — LAN or VPN only.
- **CSRF guard.** The `SameSite=Strict` cookie is not sent on requests from foreign sites, and every mutating endpoint additionally accepts `POST` only, and only with its own `Referer`. The second layer can be disabled with `WEB_CSRF=off`.
- **Scripts cannot be run from the UI.** They can only be syntax-checked (`sh -n`); they execute at container start. That way a single authentication slip is not an instant root shell.
- **Nothing sensitive is kept in the browser.** The panel never writes to `localStorage`/`sessionStorage`: state lives in the tab and dies with it. The config is always read from the server.
- **The panel refuses to run in a frame** (clickjacking), and a `Content-Security-Policy` forbids any external loads and inline scripts.
- **Archive import does not trust the archive**: entries with `..` or absolute paths reject it outright, extraction happens in tmpfs, and only whitelisted directories/extensions are copied into place.

If you need the panel from scripts (curl/automation): log in once and keep the cookie jar, then send it with every request. The `POST`-only rule still applies; with `WEB_CSRF=off` the `Referer` header is not needed.

```bash
curl -c jar -H 'Referer: http://<ip>/' --data-binary $'admin\nadmin' http://<ip>/cgi-bin/login
curl -b jar http://<ip>/cgi-bin/get-config
```

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
/www/                            web panel (index.html + login.html + assets + cgi-bin)
/entrypoint.sh                   httpd-from-RAM + mihomo supervisor
```

## 🌍 Geo databases & extra files

Drop into `/etc/mihomo/` as needed: `geoip.metadb` / `geosite.dat` / `geoip.dat` / `GeoLite2-ASN.mmdb` (for `GEOIP`/`GEOSITE`/`IP-ASN` rules), a dashboard in `ui/` (+ `external-ui: ui`), and provider files in `proxy-providers/` and `provider-rules/` (including compiled `.mrs`). The runtime `cache.db` (fake-ip / selected node) is created automatically.

## 🐳 Architectures & build

`latest` is multi-arch: `amd64` (built as **v3**), `arm64`, `armv7`, `armv5`. For older x86 CPUs pull the `amd64v1` / `amd64v2` tags. `armv5` (which Alpine doesn't publish) is built on a bundled Buildroot rootfs (`rootfs.tar`) instead of Alpine.

> ⚠ **armv5: the web panel does not work.** The busybox httpd in the current `rootfs.tar` is built without CGI (and without basic auth): `/cgi-bin/*` is served as plain text and `POST` returns 501. The mihomo core itself runs fine. The only fix is rebuilding the rootfs with `CONFIG_FEATURE_HTTPD_CGI=y`.

**gVisor.** Regular tags ship a core built **without gVisor** — it is ~9 MiB smaller and the default config (`tun.stack: system`) doesn't need it. If you use `tun.stack: gvisor` / `mixed` or a Tailscale outbound, pull the same tag with the `-gvisor` suffix: `latest-gvisor`, `amd64v1-gvisor`, `amd64v2-gvisor`, `<version>-gvisor`.

```bash
docker build -t mihomo-ros .                                  # amd64 = v3 by default
docker build --build-arg AMD64VERSION=v1 -t mihomo-ros:amd64v1 .
docker build --build-arg MIHOMO_VERSION=v1.19.27 -t mihomo-ros .
docker build --build-arg MIHOMO_CUSTOM_CORE=1 --build-arg MIHOMO_FLAVOR=gvisor -t mihomo-ros:latest-gvisor .
```

A local build takes the upstream MetaCubeX core by default (`MIHOMO_CUSTOM_CORE=0`), which always includes gVisor; the plain/`-gvisor` split applies to the `mihomo-proxy-ros` core (`MIHOMO_CUSTOM_CORE=1`, used by CI).

| `AMD64VERSION` | Instructions | CPU | Image tag |
|---|---|---|---|
| `v1` | baseline SSE2 | any x86-64 | `amd64v1` / `amd64v1-gvisor` |
| `v2` | SSE3/SSSE3/SSE4.x | ~2009+ | `amd64v2` / `amd64v2-gvisor` |
| `v3` (default) | AVX/AVX2/BMI | ~2015+, faster | `latest` / `latest-gvisor` |

## 💖 Support

- **USDT (TRC20):** `TWDDYD1nk5JnG6FxvEu2fyFqMCY9PcdEsJ`
- [boosty.to/petersolomon/donate](https://boosty.to/petersolomon/donate)
