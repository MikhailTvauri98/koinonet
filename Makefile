.PHONY: up down test shell

up:
	docker compose -f infra/compose.yml up -d --build

down:
	docker compose -f infra/compose.yml down

test:
	docker compose -f infra/compose.yml exec app ./vendor/bin/pest

shell:
	docker compose -f infra/compose.yml exec app sh
