#!/bin/sh
set -eu

for family in Arial Georgia 'Times New Roman' 'Trebuchet MS'; do
  resolved=$(fc-match --format '%{family}\n' "$family" | head -n 1)
  case "$resolved" in
    *"$family"*) ;;
    *)
      echo "Required font '$family' resolved as '$resolved'" >&2
      exit 1
      ;;
  esac
done
