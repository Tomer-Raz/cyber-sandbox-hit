#!/bin/sh
set -e

# ZAP's REST API, unauthenticated (api.disablekey) — the only thing that can
# reach it is app/services/zap_service.py in this same container, over
# localhost. Backgrounded so the worker below can start immediately;
# zap_service.wait_until_ready() polls until it actually answers.
/zap/zap.sh -daemon -host 0.0.0.0 -port 8080 -notel \
    -config api.disablekey=true \
    -config database.recoverylog=false &

exec python3 -m app.scanner_worker
