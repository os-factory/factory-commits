#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# Signed by a key that is not in allowed_signers.
fc_keygen dev
ssh-keygen -q -t ed25519 -N '' -C '' -f "$FC_OUT/stranger.key"
fc_commit a.txt a "feat: one

Work-Unit: github:416"
fc_note HEAD "$(fc_sign "$(fc_entry "$(fc_statement "$(fc_tree)")")" stranger)"
