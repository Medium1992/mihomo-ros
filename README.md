# mihomo-ros

Лёгкий Alpine-контейнер с ядром [mihomo](https://github.com/MetaCubeX/mihomo) и
веб-редактором конфига на чистом `busybox httpd` + sh CGI. Рассчитан на запуск
локально на роутере.

## Что внутри

```
/usr/local/bin/mihomo        ядро (качается в Dockerfile под нужную архитектуру)
/etc/mihomo/                 рабочая директория (-d)
  ├── config.yaml            активный конфиг
  ├── scripts/               sh-хуки, выполняются entrypoint при старте
  ├── proxy-providers/       файлы провайдеров прокси (.yaml)
  └── provider-rules/        файлы провайдеров правил (.yaml/.list/.mrs)
/www/                        веб-интерфейс
  ├── index.html / assets/   современный UI (тёмная тема, без CDN — работает офлайн)
  └── cgi-bin/               get-config · validate · save-config · status
```

## Веб-интерфейс

Современный YAML-редактор с нумерацией строк. Кнопки:

- **Проверить** — `mihomo -t` без применения (горячая клавиша `Ctrl+Enter`)
- **Применить** — валидация → сохранение → горячая перезагрузка ядра через
  RESTful API (`PUT /configs?force=true`), без рестарта контейнера (`Ctrl+S`)
- **Сбросить** — перечитать `config.yaml` с диска

Боковая панель показывает статус ядра и версию. Разделы (Общие, Снифер, DNS,
Listeners, Proxy-providers, Proxies, Rules) — заглушки под будущий
секционный редактор.

## Запуск

Готовые образы публикуются в GHCR и Docker Hub
(`latest` = multi-arch, amd64 собран как `v3`):

```bash
docker run -d --name mihomo-ros \
  --network host --cap-add NET_ADMIN --cap-add NET_RAW \
  -e BASIC_AUTH_USER=admin -e BASIC_AUTH_PASS=change-me \
  -v "$PWD/data:/etc/mihomo" \
  ghcr.io/medium1992/mihomo-ros:latest
# UI:  http://<router-ip>/
```

Для старого x86-CPU без AVX2 — тег `amd64v1` или `amd64v2`.
Конфиг ядра живёт в `./data` на хосте и переживает пересоздание контейнера.

Локальная сборка:

```bash
docker build -t mihomo-ros .                       # amd64 = v3 по умолчанию
docker build --build-arg AMD64VERSION=v1 -t mihomo-ros:amd64v1 .
```

## Переменные окружения

| Переменная        | По умолч.     | Назначение                                   |
|-------------------|---------------|----------------------------------------------|
| `WEB_PORT`        | `80`          | порт веб-интерфейса                          |
| `API_HOST`        | `127.0.0.1`   | хост RESTful API ядра                        |
| `API_PORT`        | `9090`        | порт API (= `external-controller` в конфиге) |
| `API_SECRET`      | пусто         | секрет API (продублируй `secret:` из конфига)|
| `BASIC_AUTH_USER` | пусто         | логин basic auth вебки (пусто = выключено)   |
| `BASIC_AUTH_PASS` | пусто         | пароль basic auth                            |
| `TZ`              | Europe/Moscow | таймзона                                     |

> Basic auth включается автоматически, когда заданы и логин, и пароль. Пароль
> хешируется (`openssl passwd -1`) при записи в `httpd.conf`.

## Гео-базы и файлы для конфига

Положи в `/etc/mihomo/` при необходимости: `geoip.metadb` / `geosite.dat` /
`country.mmdb` / `GeoLite2-ASN.mmdb` (для `GEOIP`/`GEOSITE`/`IP-ASN`),
дашборд в `ui/` (+ `external-ui: ui`), файлы провайдеров в `proxy-providers/`
и `provider-rules/` (включая компилированные `.mrs`).

## Архитектуры

Dockerfile собирается под `amd64`, `arm64`, `armv7`, `armv6`, `armv5`
(buildx подставляет нужный ассет mihomo). Версия ядра — арг `MIHOMO_VERSION`
(`latest` или тег вида `v1.x.x`).

Для `amd64` уровень микроархитектуры (`GOAMD64`) выбирается аргом
`AMD64VERSION` — официальный mihomo публикует готовые бинарники `v1/v2/v3`:

| `AMD64VERSION`   | Инструкции          | CPU             | Тег образа |
|------------------|---------------------|-----------------|------------|
| `v1`             | baseline SSE2       | любой x86-64    | `amd64v1`  |
| `v2`             | SSE3/SSSE3/SSE4.x   | ~2009+          | `amd64v2`  |
| `v3` (по умолч.) | AVX/AVX2/BMI        | ~2015+, быстрее | `latest`   |

`latest` (multi-arch) собирается с `v3`; `v1`/`v2` публикуются отдельными
тегами `amd64v1` / `amd64v2`.

```bash
# собрать вариант под старый CPU:
docker buildx build --build-arg AMD64VERSION=v1 -t mihomo-ros:amd64v1 .
```

> `v4` официально не собирается — если нужен, его придётся билдить из исходников
> самому (как в `mihomo-proxy-ros`).
