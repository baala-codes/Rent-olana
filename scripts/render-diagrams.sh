#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
cd "$repo_root"

for command in plantuml dot; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Required command not found: %s (install PlantUML and Graphviz).\n' "$command" >&2
    exit 1
  fi
done

# Every committed PlantUML source is rendered; the SVG basename matches the
# source basename.
mapfile -t source_files < <(find docs/diagrams -maxdepth 1 -name '*.puml' | sort)
if ((${#source_files[@]} == 0)); then
  printf 'No PlantUML sources found in docs/diagrams.\n' >&2
  exit 1
fi

render_tmp="$(mktemp -d)"
trap 'rm -rf -- "$render_tmp"' EXIT

# Render and validate all diagrams before replacing any existing SVGs.
for source_file in "${source_files[@]}"; do
  name="$(basename "$source_file" .puml)"

  raw_svg="$render_tmp/$name.raw.svg"
  stderr_file="$render_tmp/$name.stderr"
  if ! JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:+$JAVA_TOOL_OPTIONS }-Djava.awt.headless=true" \
    plantuml -tsvg -pipe -charset UTF-8 -failfast2 \
      < "$source_file" > "$raw_svg" 2> "$stderr_file"; then
    cat "$stderr_file" >&2
    printf 'Failed to render %s.\n' "$source_file" >&2
    exit 1
  fi
  if ! grep -q '<svg' "$raw_svg"; then
    cat "$stderr_file" >&2
    printf 'PlantUML did not produce an SVG for %s.\n' "$source_file" >&2
    exit 1
  fi

  sed '0,/<svg/{s|<svg[^>]*>|&<rect width="100%" height="100%" fill="#FFFFFF"/>|;}' \
    "$raw_svg" > "$render_tmp/$name.svg"
done

for source_file in "${source_files[@]}"; do
  name="$(basename "$source_file" .puml)"
  cp -- "$render_tmp/$name.svg" "docs/diagrams/$name.svg"
  printf 'Rendered docs/diagrams/%s.svg\n' "$name"
done
