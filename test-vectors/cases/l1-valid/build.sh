#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# A valid, passing, unsigned statement on the commit's tree.
fc_commit a.txt a "chore: no trailers"
fc_note HEAD "$(fc_entry "$(fc_statement "$(fc_tree)")")"
git tag no-trailers
fc_commit b.txt b "feat: recorded

Work-Unit: github:416
Factory-Run: 01JD4X7Q"
fc_note HEAD "$(fc_entry "$(fc_statement "$(fc_tree)" "$(fc_rev)")")"
