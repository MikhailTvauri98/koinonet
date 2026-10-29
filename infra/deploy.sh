#!/bin/sh
# Выкладка на сервере (docs/deploy.md). Запускается из
# .github/workflows/deploy.yml по SSH как `TAG=<коммит> sh /srv/church/deploy.sh`;
# лежит рядом с compose.prod.yml и .env, деплой обновляет оба файла перед
# запуском. Вход в GHCR и выход из него делает сам workflow.
set -eu

: "${TAG:?TAG — коммит, образы которого выкладываются}"
cd "$(dirname "$0")"

compose() {
    docker compose -f compose.prod.yml "$@"
}

# Версия, которая работает сейчас: цель отката и образ, который очистка
# в конце оставит на сервере.
running=$(sed -n 's/^TAG=//p' .env)

compose pull

# Миграции — до переключения, разовым контейнером нового образа: новый код не
# принимает запросов, пока схема не готова. Старый код в эти секунды работает
# с уже новой схемой, поэтому миграции пишутся совместимыми с предыдущей
# версией кода (добавить сейчас, удалять старое — следующим деплоем).
compose run --rm -T app php artisan migrate --force

# Horizon останавливается до переключения, пока старый app ещё отвечает: по
# SIGTERM он доделывает текущие задачи (до stop_grace_period), новые задачи
# копятся в Redis и достаются новому воркеру. Это и есть перезапуск Horizon,
# который делал бы `horizon:terminate`.
compose stop worker

# Пересоздаёт контейнеры с новым тегом (заодно это сброс кешей: каждый
# контейнер PHP собирает их при старте) и ждёт здоровья web, app и reverb,
# а остальные — запущены. Иначе контейнеры в цикле перезапуска дали бы зелёный
# деплой и 502 в проде.
if ! compose up -d --remove-orphans --wait --wait-timeout 180; then
    echo "Новая версия ${TAG} не поднялась. В .env остался тег работавшей версии (${running:-нет}); откат — docs/deploy.md, «Откат»." >&2
    compose ps -a >&2
    compose logs --no-color --tail 40 web app worker scheduler reverb >&2
    exit 1
fi

# Ручные команды `docker compose` на сервере берут тег из .env.
if grep -q '^TAG=' .env; then
    sed -i "s/^TAG=.*/TAG=${TAG}/" .env
else
    printf 'TAG=%s\n' "$TAG" >> .env
fi

# Очистка: из образов app и web на сервере остаются выложенный и предыдущий —
# на него откатываются без GHCR. Предыдущий — работавшая до деплоя версия; при
# повторной выкладке того же тега — самый новый из остальных. Неудачное
# удаление деплой не роняет: версия уже выложена. Образ app записан у четырёх
# сервисов, `sort -u` оставляет каждый репозиторий один раз.
for repo in $(compose config --images | sed -n "s|:${TAG}\$||p" | sort -u); do
    previous=$running
    if [ -z "$previous" ] || [ "$previous" = "$TAG" ]; then
        previous=$(docker image ls --format '{{.Tag}}' "$repo" | grep -vx -e "$TAG" -e '<none>' | head -n 1 || true)
    fi
    docker image ls --format '{{.Tag}} {{.ID}}' "$repo" | while read -r tag id; do
        if [ "$tag" = "$TAG" ] || [ "$tag" = "$previous" ]; then
            continue
        fi
        if [ "$tag" = '<none>' ]; then
            target=$id
        else
            target=$repo:$tag
        fi
        docker image rm "$target" > /dev/null || echo "Не удалось удалить образ $target" >&2
    done
done
