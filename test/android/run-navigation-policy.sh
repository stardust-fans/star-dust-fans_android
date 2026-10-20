#!/usr/bin/env sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
source_dir="$root/apps/android/app/src/main/java/com/stardust/fans"
output=$(mktemp -d)
trap 'rm -rf "$output"' EXIT HUP INT TERM
javac -encoding UTF-8 -d "$output" \
  "$source_dir/NavigationPolicy.java" \
  "$root/test/android/NavigationPolicyTest.java"
java -cp "$output" com.stardust.fans.NavigationPolicyTest
printf '%s\n' 'NavigationPolicy checks passed.'
