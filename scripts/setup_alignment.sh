#!/bin/sh
# One-time downloads, then offline alignment; rerun to resume completed work.
set -eu
cd "$(dirname "$0")/.."
project_dir=$(pwd)
export XDG_DATA_HOME="$project_dir/.argos/data"
export XDG_CONFIG_HOME="$project_dir/.argos/config"
export XDG_CACHE_HOME="$project_dir/.argos/cache"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
if .venv/bin/python -c 'import argostranslate.translate' >/dev/null 2>&1; then
  echo "Argos Translate is already installed."
else
  .venv/bin/python -m pip install argostranslate
fi
if .venv/bin/python -c 'import argostranslate.package as p; raise SystemExit(0 if any(x.from_code == "ru" and x.to_code == "en" for x in p.get_installed_packages()) else 1)' >/dev/null 2>&1; then
  echo "Russian-to-English model is already installed."
else
  .venv/bin/argospm update
  .venv/bin/argospm install translate-ru_en
fi
echo "Starting or resuming alignment (Ctrl-C to pause)."
.venv/bin/python scripts/align.py --translator argos --resume "$@"
