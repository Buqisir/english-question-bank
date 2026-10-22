#!/bin/sh
# Fixed internal Node launcher: prevent V8/native failures from writing cores.
ulimit -c 0 || exit 70
exec "${EQB_PROMOTION_NODE:?trusted Node executable required}" "$@"
