.PHONY: test backend frontend

test:
	./scripts/test.sh

backend:
	./scripts/run-backend.sh

frontend:
	./scripts/run-frontend.sh
