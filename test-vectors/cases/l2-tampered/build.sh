#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# A trusted key signed other bytes than this envelope's PAE.
fc_keygen dev
fc_commit a.txt a "feat: one

Work-Unit: github:416"
printf 'not the PAE' > "$FC_OUT/other.bin"
fc_note HEAD "$(fc_sign "$(fc_entry "$(fc_statement "$(fc_tree)")")" dev "$FC_OUT/other.bin")"
