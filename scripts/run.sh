#!/usr/bin/env bash
set -euo pipefail
uvicorn motor_originacao.main:app --host 0.0.0.0 --port 8000 --app-dir src --reload
