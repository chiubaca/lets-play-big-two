#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

cd "$ROOT_DIR/apps/android"
vp dlx @bubblewrap/cli@1.25.0 update --skipVersionUpgrade
