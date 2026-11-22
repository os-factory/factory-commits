#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# Amend and squash keep the tree; the note follows (notes.rewriteRef, git notes copy).
git config notes.rewriteRef refs/notes/factory
fc_commit a.txt a "chore: base"
git checkout -q -b topic
fc_commit b.txt b "feat: b, part 1

Work-Unit: github:416"
fc_commit c.txt c "feat: b, part 2

Work-Unit: github:416"
fc_note HEAD "$(fc_entry "$(fc_statement "$(fc_tree)")")"
GIT_COMMITTER_DATE="2026-01-02T00:00:00Z" git commit -q --amend -m "feat: b, reworded

Work-Unit: github:416"
git tag amended
git checkout -q main
git merge -q --squash topic
GIT_COMMITTER_DATE="2026-01-03T00:00:00Z" git commit -q -m "feat: b (#1)

Work-Unit: github:416"
git notes --ref=refs/notes/factory copy amended HEAD
git tag squashed
