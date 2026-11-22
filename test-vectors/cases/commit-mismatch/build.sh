#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# Same tree, but gitCommit names another commit (an amend that pinned the old id).
fc_commit a.txt a "feat: one

Work-Unit: github:416"
old=$(fc_rev)
git commit -q --amend -m "feat: one, reworded

Work-Unit: github:416"
fc_note HEAD "$(fc_entry "$(fc_statement "$(fc_tree)" "$old")")"
