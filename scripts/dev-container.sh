#!/usr/bin/env bash

RESTART_FLAG=/tmp/backend-restart
JAVA_OPTS=(-XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss512k -Xms8m -Xmx48m -XX:MinHeapFreeRatio=10 -XX:MaxHeapFreeRatio=25 -XX:MaxMetaspaceSize=64m -XX:ReservedCodeCacheSize=24m)

run_backend() {
  cd /app/backend
  while true; do
    rm -f "$RESTART_FLAG"
    if mvn -B -q package; then
      java "${JAVA_OPTS[@]}" -jar target/*.jar &
      pid=$!
      while kill -0 "$pid" 2>/dev/null && [ ! -f "$RESTART_FLAG" ]; do
        sleep 0.3
      done
      kill "$pid" 2>/dev/null
      wait "$pid"
    fi
    until [ -f "$RESTART_FLAG" ]; do
      sleep 0.3
    done
  done
}

run_backend &

cd /app/frontend
node node_modules/vite/bin/vite.js --host &

wait -n
exit 1
