#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# Malformed trailers: an uppercase source, an uppercase trace id, a short digest.
fc_commit a.txt a "feat: one

Work-Unit: GitHub:416
Factory-Run: 01JD4X7Q; trace=4BF92F3577B34DA6A3CE929D0E0E4736
Factory-Attestation: sha256:abc"
git tag only-malformed
fc_commit b.txt b "feat: two

Work-Unit: GitHub:416
Factory-Run: 01JD4X7Q"
