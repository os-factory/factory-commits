#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# Trailers only, no note: a claim without proof.
fc_commit a.txt a "feat: linked

Work-Unit: github:416
Factory-Run: 01JD4X7Q; trace=4bf92f3577b34da6a3ce929d0e0e4736
Factory-Policy: default@3
Factory-Agent: claude-code/2.1; model=claude-opus-5-5"
