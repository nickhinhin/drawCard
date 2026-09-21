#!/bin/zsh
set -euo pipefail
: "${DEVELOPMENT_TEAM:?請設定客人 Apple Developer Team ID}"
: "${NOTARY_PROFILE:?請設定已儲存於 Keychain 的 notarytool profile 名稱}"
xcodebuild -project LiveDrawAdmin.xcodeproj -scheme LiveDrawAdmin -configuration Release \
  -archivePath build/LiveDrawAdmin.xcarchive DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" archive
xcodebuild -exportArchive -archivePath build/LiveDrawAdmin.xcarchive \
  -exportPath build/export -exportOptionsPlist Resources/ExportOptions.plist
ditto -c -k --keepParent "build/export/LiveDraw Admin.app" build/LiveDrawAdmin.zip
xcrun notarytool submit build/LiveDrawAdmin.zip --keychain-profile "$NOTARY_PROFILE" --wait
xcrun stapler staple "build/export/LiveDraw Admin.app"
