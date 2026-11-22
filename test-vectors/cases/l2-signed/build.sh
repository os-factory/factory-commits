#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# A passing statement signed by a key listed in allowed_signers.
fc_keygen dev
fc_commit a.txt a "feat: one

Work-Unit: github:416"
fc_note HEAD "$(fc_sign "$(fc_entry "$(fc_statement "$(fc_tree)")")" dev)"
