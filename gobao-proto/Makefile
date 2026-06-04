.PHONY: lint generate breaking tidy

lint:
	buf lint

generate:
	buf generate

breaking:
	buf breaking --against '.git#branch=main'

tidy:
	go mod tidy