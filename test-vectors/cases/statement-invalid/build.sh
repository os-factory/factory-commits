#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# The predicate lacks the required producer.
fc_commit a.txt a "feat: one

Work-Unit: github:416"
fc_note HEAD "$(fc_entry "$(fc_statement "$(fc_tree)" "" "$(fc_predicate 'del(.producer)')")")"
