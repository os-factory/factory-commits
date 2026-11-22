#!/bin/sh
. "$(dirname "$0")/../../lib.sh"
fc_init "$1"
fc_commit a.txt a "feat: one

Work-Unit: github:416"
fc_raw_note HEAD '{"type":"https://os-factory.dev/factory-commits/note/v0.1"}'
