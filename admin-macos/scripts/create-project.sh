#!/bin/zsh
set -euo pipefail
cd "${0:A:h}/.."
command -v xcodegen >/dev/null || { echo "請先安裝 XcodeGen：brew install xcodegen"; exit 1; }
test -f Resources/GoogleService-Info.plist || { echo "請先加入客人 Firebase 下載的 Resources/GoogleService-Info.plist"; exit 1; }
xcodegen generate
echo "已建立 LiveDrawAdmin.xcodeproj"
