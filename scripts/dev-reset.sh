#!/usr/bin/env bash
# Resets the local dev environment to a clean state (as if freshly installed).
# Removes the database, encryption key, and frontend state.
# The app will recreate everything on next startup.

set -euo pipefail

APP_DIR="$HOME/.local/share/com.katomus.godardstack"

if pgrep -f "godard-stack" > /dev/null 2>&1; then
  echo "ERROR: godard-stack is running. Stop the app before resetting." >&2
  exit 1
fi

echo "Resetting Godard dev environment..."

remove() {
  local path="$1"
  if [ -e "$path" ]; then
    rm -rf "$path"
    echo "  removed: $path"
  fi
}

remove "$APP_DIR/data/godard-stack.db"
remove "$APP_DIR/data/godard-stack.db-wal"
remove "$APP_DIR/data/godard-stack.db-shm"
remove "$APP_DIR/secrets/connection.key"
remove "$APP_DIR/localstorage/http_127.0.0.1_1420.localstorage"
remove "$APP_DIR/localstorage/tauri_localhost_0.localstorage"
remove "$APP_DIR/runtime/ready-1.json"

echo "Done. Start the app normally — Flyway will apply all migrations on first boot."
