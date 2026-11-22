#!/usr/bin/env bash
# Fills in writeup.html and prints it to PDF with headless Chrome.
# The filled HTML and the PDF are written outside the repository (default:
# ~/Desktop), so the App Key and judge passwords are never committed.
#
# Usage:
#   APP_KEY=... APK_URL=... VIDEO_URL=... DEMO_USERS="judge1:pw1,judge2:pw2" \
#     bash docs/internal/submission/build-pdf.sh [output-dir]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$HOME/Desktop}"
: "${APP_KEY:?Set APP_KEY}"
: "${DEMO_USERS:?Set DEMO_USERS (judge1:pw1,judge2:pw2)}"
APK_URL="${APK_URL:-https://github.com/Subramanyarao11/react-native-nexconn/releases/download/v0.1.0-beta.0/nexconn-demo-v0.1.0-beta.0.apk}"
VIDEO_URL="${VIDEO_URL:-(video link)}"
pw() { tr ',' '\n' <<<"$DEMO_USERS" | awk -F: -v u="$1" '$1==u{print $2}'; }
J1="$(pw judge1)"; J2="$(pw judge2)"
[[ -n "$J1" && -n "$J2" ]] || { echo "DEMO_USERS must contain judge1 and judge2"; exit 1; }
mkdir -p "$out"
html="$out/nexconn-writeup.html"
APP_KEY="$APP_KEY" APK_URL="$APK_URL" VIDEO_URL="$VIDEO_URL" J1="$J1" J2="$J2" \
  node -e '
    const fs = require("fs");
    const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
    let t = fs.readFileSync(process.argv[1], "utf8");
    const v = { APP_KEY: process.env.APP_KEY, APK_URL: process.env.APK_URL, VIDEO_URL: process.env.VIDEO_URL,
                JUDGE1_PASSWORD: process.env.J1, JUDGE2_PASSWORD: process.env.J2 };
    for (const [k, val] of Object.entries(v)) t = t.split("{{" + k + "}}").join(esc(val));
    fs.writeFileSync(process.argv[2], t);
  ' "$here/writeup.html" "$html"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[[ -x "$chrome" ]] || chrome="$(command -v google-chrome || command -v chromium || true)"
[[ -n "$chrome" ]] || { echo "Chrome not found; open $html in a browser and print to PDF"; exit 1; }
"$chrome" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$out/nexconn-writeup.pdf" "file://$html" 2>/dev/null
echo "PDF: $out/nexconn-writeup.pdf"
