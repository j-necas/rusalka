#!/usr/bin/env bash
# Runs Rusalka locally for development: http://127.0.0.1:<port> straight from static/ (reload the page after a change).
#   ./run_dev.sh              first free port from 8766, opens the browser
#   ./run_dev.sh 9000         a given port
#   ./run_dev.sh --no-open    don't open the browser
# Installs the dependencies and copies the libraries on the first run; builds the skill zips (linked from the AI window)
# and the song library (/library/, review page /library/review.html).
# Ctrl+C stops the server. Data live in the browser per address (or in the folder chosen in Data and backups).
set -euo pipefail
cd "$(dirname "$0")"

port="" otevrit=1
for a in "$@"; do
  case "$a" in
    --no-open) otevrit=0 ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *[!0-9]*|'') echo "unknown argument: $a (see ./run_dev.sh --help)" >&2; exit 2 ;;
    *) port="$a" ;;
  esac
done

command -v node >/dev/null || { echo "Node.js is missing: https://nodejs.org (on a Mac also: brew install node)" >&2; exit 1; }
volny() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

if [ -z "$port" ]; then
  port=8766
  while ! volny "$port"; do port=$((port + 1)); [ "$port" -gt 8799 ] && { echo "no free port 8766–8799" >&2; exit 1; }; done
elif ! volny "$port"; then
  echo "port $port is taken; run without a port to pick a free one" >&2; exit 1
fi

[ -d node_modules ] || npm install
[ -f static/vendor/verovio-toolkit-wasm.js ] || npm run vendor --silent
npm run skills --silent >/dev/null || echo "(skill zips not built – the Helper links won't work)" >&2
npm run library --silent >/dev/null || echo "(song library has errors – see npm run library)" >&2

url="http://127.0.0.1:$port"
if [ "$otevrit" = 1 ]; then
  (
    for _ in $(seq 50); do volny "$port" || break; sleep 0.1; done
    if [ "$(uname)" = Darwin ]; then
      open -a "Google Chrome" "$url" 2>/dev/null || open -a "Microsoft Edge" "$url" 2>/dev/null || open "$url"
    else
      xdg-open "$url" >/dev/null 2>&1 || true
    fi
  ) &
fi
echo "Rusalka: $url (Chrome or Edge for MIDI; Ctrl+C stops)"
PORT="$port" exec node tools/server.mjs
