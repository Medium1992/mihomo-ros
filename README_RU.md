[English](/README.md) | [Русский](/README_RU.md) · [Telegram](https://t.me/+96HVPF3Ww6o3YTNi)

# mihomo-ros

> Мультиархитектурный Docker-контейнер для **MikroTik RouterOS**: ядро [mihomo](https://github.com/MetaCubeX/mihomo) плюс встроенная **веб-панель на чистом `busybox httpd` + sh CGI** (без Node.js) — удобный редактор-комбайн YAML/sh для тех, кто пишет конфиг mihomo руками.

[![Docker Pulls](https://img.shields.io/docker/pulls/medium1992/mihomo-ros?logo=docker&label=docker%20pulls)](https://hub.docker.com/r/medium1992/mihomo-ros)
[![Docker Image Size](https://img.shields.io/docker/image-size/medium1992/mihomo-ros/latest?logo=docker&label=image%20size)](https://hub.docker.com/r/medium1992/mihomo-ros)
[![License](https://img.shields.io/github/license/Medium1992/mihomo-ros)](./LICENSE)
![Platforms](https://img.shields.io/badge/arch-amd64%20%7C%20arm64%20%7C%20armv7%20%7C%20armv5-blue)
[![Telegram](https://img.shields.io/badge/Telegram-group-blue?logo=telegram)](https://t.me/+96HVPF3Ww6o3YTNi)

## ✨ Возможности

- 🧰 **Ручной редактор** — быстрый YAML/sh-редактор для продвинутых, а не визуальный конструктор конфига
- 🖥 **Встроенная вебка** на порту `80`, отдаётся busybox httpd прямо из контейнера — без CDN, работает офлайн
- 🧩 **Навигация по разделам одного файла** — YAML-конфиг режется по top-level ключам upstream (Общие, DNS, Снифер, Прокси, Группы, Правила, …); правишь срез или весь файл, единый источник истины
- 📖 **Дока mihomo в каждом разделе** — короткое примечание, пример и прямая ссылка на официальную вики
- ✅ **Живая валидация** — `mihomo -t` для конфига и proxy-providers, `convert-ruleset` для provider-rules, `sh -n` для скриптов, всё на tmpfs
- 🪝 **Pre/Post-хуки** — `scripts/` выполняются до mihomo, `scripts-post/` — после старта; проверка / вкл / выкл / удаление из вебки
- 🗂 **Файловые менеджеры** для `proxy-providers/` и `provider-rules/`: создать / проверить / удалить
- 💾 **Импорт/экспорт** — отдельный файл в один клик, весь проект целиком в `.tar` или JSON-бандлом; после восстановления вебка перечитывает данные без перезагрузки страницы
- ⌨️ **Команды редактора** — `Ctrl+S` применить, `Ctrl+Enter` проверить, `Ctrl+/` коммент, `Ctrl+]`/`Ctrl+[` отступ, `Tab`/`Shift+Tab` блок
- 🔐 **Basic auth по хешу пароля** — логин + готовый md5crypt-хеш в ENV; хеш генерируется на странице **Инструменты**. Плюс CSRF-guard на изменяющих запросах
- 🛟 **Вебка — основа** — она работает, даже если mihomo не стартует на битом конфиге; супервизор перезапускает ядро каждые 5 с, так что конфиг всегда можно поправить в UI
- 💾 **Ноль износа флеша** — webroot работает из ОЗУ (`/dev/shm`), все временные/валидационные файлы — в tmpfs

> Сделано под роутеры, где root-dir контейнера на FAT/USB/SMB (нет Unix-бита `+x`) — CGI копируется в tmpfs и делается исполняемым при старте.

## 🖥 Веб-интерфейс

**`http://<ip-контейнера>:80/`** — локальная панель управления, которую отдаёт busybox httpd из самого контейнера.

Редактирует файлы на диске и применяет конфиг через RESTful API mihomo — без перезапуска контейнера.

> [!IMPORTANT]
> Панель закрыта HTTP basic auth. **По умолчанию `admin` / `admin` — смените пароль.**
> *Инструменты → Хеш-пароль*: введите новый пароль, получите md5-хеш, положите его в env
> `BASIC_AUTH_HASH`. Сам пароль в env не хранится. Пока пароль дефолтный, панель показывает
> предупреждение сверху. Подробнее — [Безопасность](#-безопасность).

<img width="1264" height="1268" alt="image" src="https://github.com/user-attachments/assets/d243c0db-ef15-464f-9ed7-5fe6f871ba28" />

**Страницы:**

- **YAML конфиг** — один файл, навигация по разделам. Левая колонка: *Весь конфиг* + все секции upstream (`general`, `dns`, `sniffer`, `tun`, `hosts`, `ntp`, `proxies`, `proxy-groups`, `proxy-providers`, `rules`, `rule-providers`, `sub-rules`, `listeners`, `profile`, `experimental`, `tunnels`). *Общие* собирают все top-level скаляры, не относящиеся к другим вкладкам, даже если они разбросаны по файлу. Пустые разделы показывают подсказку с примером для старта.
- **Pre / Post-скрипты** — `sh`-хуки с проверкой синтаксиса (`sh -n`), вкл/выкл (`.sh.disabled`), удалением. Правки применяются при рестарте контейнера: запуска скриптов из вебки нет намеренно (см. [Безопасность](#-безопасность)).
- **proxy-providers / provider-rules** — менеджеры файлов YAML/list/mrs, валидация через `mihomo -t` / `convert-ruleset`. Двоичные `.mrs` редактору не показываются: для них панель даёт скачивание, замену файлом с диска и удаление (заливаются кнопкой «⭱ загрузить»).
- **Инструменты** — md5crypt-хеш для `BASIC_AUTH_HASH`; конвертеры AmneziaWG/WireGuard `.conf` (включая **AWG 3.0**), TrustTunnel `.toml` и OpenVPN `.ovpn` в блок `proxies`; бэкап и восстановление.

**Импорт / экспорт.** Кнопки `⭳` / `⭱` над списком файлов работают с открытым файлом: скачивают его на диск и подставляют файл с диска в редактор (сохранение — как обычно, отдельной кнопкой, после проверки). Весь проект целиком — *Инструменты → Бэкап и восстановление*:

| Формат | Что внутри | Когда |
|---|---|---|
| `.tar` | `config.yaml` + все 4 каталога, включая бинарные `.mrs` | полный бэкап, открывается любым архиватором |
| `.json` | то же одним текстовым файлом, двоичные `.mrs` — в base64 | удобно смотреть глазами и править |

Восстановление перезаписывает файлы с совпадающими именами, `config.yaml` применяется последним и **только если проходит `mihomo -t`**. Всё, что не проходит whitelist каталогов/расширений, пропускается и перечисляется в журнале. После импорта панель перечитывает данные сама — без перезагрузки страницы.

> ⚠ Бэкап содержит секреты открытым текстом: `secret` ядра, пароли и ключи прокси. Храните его так же аккуратно, как сам `config.yaml`.

**Редактор:** нумерация строк, мягкий таб (2 пробела) и команды:

| Сочетание | Действие |
|---|---|
| `Ctrl+S` | Проверить + сохранить + горячая перезагрузка ядра |
| `Ctrl+Enter` | Только проверка (`mihomo -t`) |
| `Ctrl+/` | Закомментировать/раскомментировать строку или выделение |
| `Ctrl+]` / `Ctrl+[` | Отступ вправо / влево |
| `Tab` / `Shift+Tab` | Отступ блока (при многострочном выделении) |

## ⚡ Быстрый старт (Docker)

```bash
docker run -d --name mihomo-ros \
  --network host --cap-add NET_ADMIN --cap-add NET_RAW \
  -e BASIC_AUTH_USER=admin \
  -e BASIC_AUTH_HASH='$1$mihomors$BipEGg3TOdgaQSFfGtisO1' \
  -v "$PWD/data:/etc/mihomo" \
  ghcr.io/medium1992/mihomo-ros:latest
# UI:  http://<ip-роутера>/        (логин по умолчанию admin / admin)
```

Хеш по умолчанию — это хеш пароля `admin`, поменяй его через **Инструменты → Хеш-пароль**.
Конфиг ядра живёт в `./data` на хосте и переживает пересоздание контейнера.

## 🛠 Установка на RouterOS

> ⚠️ Синтаксис ниже — для **RouterOS 7.21+** (mounts и envs цепляются **списками**: `mountlists` / `envlists`). На старых версиях команды отличаются.

Сначала включи поддержку контейнеров:

```
/system/device-mode/print
/system/device-mode/update mode=advanced container=yes
```

Затем создай veth, списки mount/env и контейнер (диск/адреса подставь свои):

```routeros
/interface/veth/add name=veth-mihomo address=192.168.255.2/30 gateway=192.168.255.1
/ip/address/add address=192.168.255.1/30 interface=veth-mihomo

/container/config/set registry-url=https://ghcr.io tmpdir=usb1/pull

/container/mounts/add list=mihomo-ros src=usb1/mihomo dst=/etc/mihomo
/container/envs/add list=mihomo-ros key=BASIC_AUTH_USER value=admin
/container/envs/add list=mihomo-ros key=BASIC_AUTH_HASH value="\$1\$mihomors\$BipEGg3TOdgaQSFfGtisO1"

/container/add remote-image=ghcr.io/medium1992/mihomo-ros:latest \
  interface=veth-mihomo root-dir=usb1/mihomo-root \
  mountlists=mihomo-ros envlists=mihomo-ros logging=yes start-on-boot=yes
```

Открой `http://192.168.255.2/` и правь конфиг в вебке. Трафик LAN направляй в контейнер через mangle/маршруты как обычно.

## 🔐 Переменные окружения

Все ENV — про веб-панель; по умолчанию логин/пароль `admin` / `admin`:

| ENV | По умолч. | Назначение |
|---|---|---|
| `BASIC_AUTH_USER` | `admin` | Логин веб-панели. |
| `BASIC_AUTH_HASH` | `$1$mihomors$BipEGg3TOdgaQSFfGtisO1` (= хеш `admin`) | **Готовый md5crypt-хеш** (`$1$…`) пароля. Свой сгенерируй на странице **Инструменты**. Пустое значение = дефолт, а не «без пароля». |
| `BASIC_AUTH` | `on` | `off` — осознанно открыть панель **без пароля**. Единственный способ отключить авторизацию. |
| `WEB_CSRF` | `on` | Проверка `Referer` на изменяющих запросах CGI. `off` — если дёргаешь эндпоинты панели из своих скриптов/curl. |

> Всё остальное — в `config.yaml`, а не в ENV. Порт и секрет API читаются из него (`external-controller` / `secret`); маршрутизация/сеть настраивается хук-скриптами в `scripts/` и `scripts-post/`.

## 🛡 Безопасность

Панель правит `config.yaml` и `sh`-скрипты, которые контейнер выполняет **от root** в сети роутера. Поэтому:

- **Смените дефолтный пароль.** Пока он `admin`, панель показывает предупреждение сверху, а контейнер пишет `WARNING` в лог. Хеш генерируется в *Инструменты → Хеш-пароль*, в env уезжает только хеш. Забыли пароль — удалите env `BASIC_AUTH_HASH` и перезапустите контейнер, вернётся `admin`.
- **Панель работает по HTTP без TLS**: basic auth и пароль в генераторе хеша идут по локальной сети в открытом виде (base64). Не выставляйте порт `80` контейнера в интернет — только LAN или VPN.
- **CSRF-guard.** Все изменяющие эндпоинты принимают только `POST` и только со своим `Referer`. Без этого любая открытая в браузере страница могла бы писать файлы в контейнер: HTTP-авторизация кешируется браузером по origin'у и прикладывается даже к запросам, инициированным чужим сайтом (`SameSite` защищает куки, а не basic auth). Отключается через `WEB_CSRF=off`.
- **Запуска скриптов из вебки нет.** Скрипты можно только проверить (`sh -n`); выполняются они при старте контейнера. Так одна ошибка в авторизации не превращается в мгновенный root-shell.
- **Ничего чувствительного не хранится в браузере.** Панель не пишет в `localStorage`/`sessionStorage` вообще: состояние живёт во вкладке и умирает вместе с ней. Конфиг всегда читается с сервера.
- **Панель нельзя встроить во фрейм** (защита от clickjacking), а `Content-Security-Policy` запрещает любые внешние загрузки и inline-скрипты.
- **Импорт архива не доверяет архиву**: пути с `..` и абсолютные отклоняются целиком, распаковка идёт в tmpfs, а на место копируется только то, что прошло whitelist каталогов и расширений.

Если панель нужна из скриптов (curl/автоматизация) — используйте `WEB_CSRF=off`; `POST`-only при этом остаётся.

## 📁 Структура

```
/usr/local/bin/mihomo            ядро (качается в Dockerfile под арх)
/etc/mihomo/                     рабочая директория ядра (-d)
  ├── config.yaml                активный конфиг
  ├── config.yaml.default        сидится при первом старте, если config.yaml нет
  ├── scripts/                   pre-хуки (до mihomo)
  ├── scripts-post/              post-хуки (после старта mihomo)
  ├── proxy-providers/           файлы провайдеров прокси (.yaml)
  └── provider-rules/            файлы провайдеров правил (.yaml/.list/.mrs)
/www/                            веб-панель (index.html + assets + cgi-bin)
/entrypoint.sh                   httpd-из-ОЗУ + супервизор mihomo
```

## 🌍 Гео-базы и доп. файлы

Клади в `/etc/mihomo/` при необходимости: `geoip.metadb` / `geosite.dat` / `geoip.dat` / `GeoLite2-ASN.mmdb` (для правил `GEOIP`/`GEOSITE`/`IP-ASN`), дашборд в `ui/` (+ `external-ui: ui`), файлы провайдеров в `proxy-providers/` и `provider-rules/` (включая компилированные `.mrs`). Рантайм-кэш `cache.db` (fake-ip / выбранная нода) создаётся автоматически.

## 🐳 Архитектуры и сборка

`latest` — мультиарх: `amd64` (собран как **v3**), `arm64`, `armv7`, `armv5`. Для старых x86-CPU — теги `amd64v1` / `amd64v2`. `armv5` (которого нет у Alpine) собирается на вложенном Buildroot-rootfs (`rootfs.tar`), а не на Alpine.

```bash
docker build -t mihomo-ros .                                  # amd64 = v3 по умолчанию
docker build --build-arg AMD64VERSION=v1 -t mihomo-ros:amd64v1 .
docker build --build-arg MIHOMO_VERSION=v1.19.27 -t mihomo-ros .
```

| `AMD64VERSION` | Инструкции | CPU | Тег образа |
|---|---|---|---|
| `v1` | baseline SSE2 | любой x86-64 | `amd64v1` |
| `v2` | SSE3/SSSE3/SSE4.x | ~2009+ | `amd64v2` |
| `v3` (по умолч.) | AVX/AVX2/BMI | ~2015+, быстрее | `latest` |

## 💖 Поддержать проект

- **USDT (TRC20):** `TWDDYD1nk5JnG6FxvEu2fyFqMCY9PcdEsJ`
- [boosty.to/petersolomon/donate](https://boosty.to/petersolomon/donate)
