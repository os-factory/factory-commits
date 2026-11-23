#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# The entry's digest is not the SHA-256 of its payload.
fc_commit a.txt a "feat: one

Work-Unit: github:416"
entry=$(fc_entry "$(fc_statement "$(fc_tree)")" | jq -c '.digest = "sha256:" + ("0" * 64)')
fc_note HEAD "$entry"
