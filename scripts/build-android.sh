#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ANDROID_DIR="$ROOT_DIR/apps/android"
SIGNING_ENV="$ANDROID_DIR/.signing.env"

if [ ! -f "$SIGNING_ENV" ]; then
  echo "Missing $SIGNING_ENV. Restore the release signing credentials before building." >&2
  exit 1
fi

cd "$ANDROID_DIR"
set -a
. "$SIGNING_ENV"
set +a

vp dlx @bubblewrap/cli@1.25.0 build
