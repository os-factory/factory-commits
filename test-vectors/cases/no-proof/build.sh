#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
# A commit with neither trailers nor a note.
fc_commit a.txt a "chore: no proof"
