
SERVICES := user product order payment gateway
COMPOSE  := docker-compose -f gobao-deploy/docker-compose.yml

.PHONY: up down ps logs build lint test proto tidy

up:    ; $(COMPOSE) up -d --build
down:  ; $(COMPOSE) down -v
ps:    ; $(COMPOSE) ps
logs:  ; $(COMPOSE) logs -f

build:
	@for s in $(SERVICES) pkg proto; do echo "== gobao-$$s" && (cd gobao-$$s && go build ./...); done

lint:
	@for s in $(SERVICES) pkg; do echo "== gobao-$$s" && (cd gobao-$$s && golangci-lint run ./...); done

test:
	@for s in $(SERVICES) pkg; do echo "== gobao-$$s" && (cd gobao-$$s && go test ./...); done

proto:
	$(MAKE) -C gobao-proto generate

tidy:
	@for s in $(SERVICES) pkg proto; do (cd gobao-$$s && go mod tidy); done
