#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# An unrecognized predicate type next to a valid factory-run statement.
fc_commit a.txt a "feat: one

Work-Unit: github:416"
other=$(fc_statement "$(fc_tree)" "" '{"anything":true}' "https://example.com/other-predicate/v1")
fc_note HEAD "$(fc_entry "$other")" "$(fc_entry "$(fc_statement "$(fc_tree)")")"
