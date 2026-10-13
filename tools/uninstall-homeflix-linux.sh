#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="HomeFlix Cyber Node"
PACKAGE_NAME="homeflix-cyber-node"

printf '\n%s\n' "===================================="
printf '%s\n' "  HomeFlix Cyber Node — Linux Removal"
printf '%s\n\n' "===================================="
printf '%s\n' "This utility can remove the Debian package and desktop shortcuts."
printf '%s\n' "Your personal HomeFlix settings and media files will be kept."
printf '\n'

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=()
elif command -v sudo >/dev/null 2>&1; then
  SUDO=(sudo)
else
  SUDO=()
fi

if command -v dpkg-query >/dev/null 2>&1 && dpkg-query -W -f='${Status}' "$PACKAGE_NAME" 2>/dev/null | grep -q "install ok installed"; then
  printf 'Detected installed Debian package: %s\n' "$PACKAGE_NAME"
  read -r -p "Remove the installed package now? [y/N] " answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    if [[ "${EUID}" -ne 0 && "${#SUDO[@]}" -eq 0 ]]; then
      echo "Removal needs administrator permission (sudo or root)."
      exit 1
    fi
    "${SUDO[@]}" apt-get remove -y "$PACKAGE_NAME"
  fi
else
  echo "No installed Debian package was detected."
fi

desktop_dirs=("$HOME/.local/share/applications")
if [[ -n "${XDG_DATA_HOME:-}" ]]; then
  desktop_dirs+=("$XDG_DATA_HOME/applications")
fi
for dir in "${desktop_dirs[@]}"; do
  [[ -d "$dir" ]] || continue
  find "$dir" -maxdepth 1 -type f \( -iname '*homeflix*.desktop' -o -iname '*cyber-node*.desktop' \) -print -delete
done

read -r -p "Remove HomeFlix user settings and cache too? [y/N] " data_answer
if [[ "$data_answer" =~ ^[Yy]$ ]]; then
  for dir in "$HOME/.config/HomeFlix Cyber Node" "$HOME/.config/homeflix-cyber-node" "$HOME/.cache/homeflix-cyber-node"; do
    if [[ -e "$dir" ]]; then
      rm -rf -- "$dir"
      printf 'Removed: %s\n' "$dir"
    fi
  done
else
  echo "Keeping user settings and cache."
fi

printf '\n%s\n' "HomeFlix Linux removal routine finished."
echo "Portable AppImage files are not removed automatically; delete the downloaded .AppImage yourself if you no longer need it."
