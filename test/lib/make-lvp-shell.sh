#!/bin/sh
# Copy Playwright's headless shell without its bundled SwiftShader Vulkan ICD so ANGLE picks Mesa's lavapipe.
set -e
SRC=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux 2>/dev/null | head -1)
[ -z "$SRC" ] && SRC=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64 2>/dev/null | head -1)
DST=${LVP_SHELL_DIR:-/tmp/deadtide-hs-lvp}
[ -f /usr/share/vulkan/icd.d/lvp_icd.json ] || (apt-get install -y -qq mesa-vulkan-drivers >/dev/null 2>&1 || echo "install mesa-vulkan-drivers for lavapipe")
rm -rf "$DST" && mkdir -p "$DST"
cp -al "$SRC"/. "$DST"/ 2>/dev/null || cp -a "$SRC"/. "$DST"/
rm -f "$DST"/libvk_swiftshader.so "$DST"/vk_swiftshader_icd.json
ls "$DST"/headless_shell >/dev/null && echo "lavapipe shell ready in $DST"
