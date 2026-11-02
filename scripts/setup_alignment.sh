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
.venv/bin/python -m pip install argostranslate
.venv/bin/argospm update
.venv/bin/argospm install translate-ru_en
.venv/bin/python scripts/align.py --translator argos --resume "$@"
