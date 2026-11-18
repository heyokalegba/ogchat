#!/bin/bash
# ogchat as an app of its own.
#
# Double-click this file in Finder (or run it from a terminal). It starts
# ogchat's local server if it is not already running, then opens ogchat in a
# window of its own, with no tabs or address bar. Closing the Terminal window
# this opens stops the server again.
#
#   OGCHAT_PORT=3100 scripts/ogchat.command    to use another port

cd "$(dirname "$0")/.." || exit 1
# Started from Finder, a script does not get the PATH a terminal has.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1

PORT="${OGCHAT_PORT:-3000}"
URL="http://127.0.0.1:$PORT"
LOG="${TMPDIR:-/tmp}/ogchat-server.log"
SERVER=""

up() { curl -s -o /dev/null --max-time 2 "$URL/api/settings"; }

if ! command -v npm >/dev/null 2>&1; then
  echo "ogchat needs Node.js, and none was found. Install it from https://nodejs.org and try again."
  read -r -p "Press Return to close."
  exit 1
fi

if up; then
  echo "ogchat is already running at $URL."
else
  [ -d node_modules ] || npm install || exit 1
  # Build once, and again whenever the app has been updated since the last build.
  if [ ! -f .next/BUILD_ID ] ||
    [ -n "$(find src public package.json next.config.ts -newer .next/BUILD_ID -print -quit 2>/dev/null)" ]; then
    echo "Getting ogchat ready (this takes a minute after an update)..."
    npm run build || {
      read -r -p "The build failed. Press Return to close."
      exit 1
    }
  fi
  echo "Starting ogchat..."
  npx next start -H 127.0.0.1 -p "$PORT" >"$LOG" 2>&1 &
  SERVER=$!
  trap '[ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null' EXIT HUP INT TERM
  for _ in $(seq 1 80); do
    up && break
    if ! kill -0 "$SERVER" 2>/dev/null; then
      echo "The server stopped. Its log:"
      tail -n 20 "$LOG"
      read -r -p "Press Return to close."
      exit 1
    fi
    sleep 0.5
  done
fi

# A window of its own where a browser can give one; otherwise an ordinary tab.
opened=""
for browser in "Google Chrome" "Brave Browser" "Microsoft Edge" "Chromium" "Arc"; do
  if [ -d "/Applications/$browser.app" ] || [ -d "$HOME/Applications/$browser.app" ]; then
    open -na "$browser" --args --app="$URL" && opened="$browser" && break
  fi
done
[ -n "$opened" ] || open "$URL"

if [ -n "$SERVER" ]; then
  echo "ogchat is running at $URL${opened:+, in a $opened window of its own}."
  echo "Leave this window open while you use it. Close it, or press Ctrl+C, to stop ogchat."
  wait "$SERVER"
fi
