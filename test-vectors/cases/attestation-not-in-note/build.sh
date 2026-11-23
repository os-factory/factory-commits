#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# A Factory-Attestation trailer whose digest is in the note, then one whose digest is not.
printf 'a\n' > a.txt && git add a.txt
st=$(fc_statement "$(git write-tree)")
printf '%s\n' "feat: one

Work-Unit: github:416
Factory-Attestation: $(fc_digest "$st")" | git commit -q -F -
fc_note HEAD "$(fc_entry "$st")"
git tag in-note
fc_commit b.txt b "feat: two

Work-Unit: github:416
Factory-Attestation: $(fc_digest "$st")"
fc_note HEAD "$(fc_entry "$(fc_statement "$(fc_tree)")")"
