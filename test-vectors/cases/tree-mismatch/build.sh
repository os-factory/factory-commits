#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# The note's statement names the parent's tree.
fc_commit a.txt a "feat: one"
parent_tree=$(fc_tree)
fc_commit b.txt b "feat: two

Work-Unit: github:416"
fc_note HEAD "$(fc_entry "$(fc_statement "$parent_tree")")"
