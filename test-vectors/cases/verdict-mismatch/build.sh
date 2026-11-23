#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# A required stage failed, but the statement claims pass.
fc_commit a.txt a "feat: one

Work-Unit: github:416"
pred=$(fc_predicate '(.stages[] | select(.id == "unit") | .status) = "failed"')
fc_note HEAD "$(fc_entry "$(fc_statement "$(fc_tree)" "" "$pred")")"
