// 웹 앱 파일(바로 위 폴더)을 앱용 www 폴더로 복사해요. 웹을 고친 뒤 'npm run sync' 하면 앱에도 반영돼요.
const fs = require("fs");
const path = require("path");

const SRC = path.resolve(__dirname, "..");
const DST = path.resolve(__dirname, "www");
const FILES = [
  "index.html", "config.js", "zones.js", "app.js", "engine.js", "profile.js", "garmin.js",
  "tracker.js", "hub.js", "auth.js", "community.js", "strava.js", "coach.js", "predict.js", "feedback.js", "drills.js", "journal.js", "nav.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png", "privacy.html", "terms.html",
];

fs.mkdirSync(DST, { recursive: true });
let n = 0;
for (const f of FILES) {
  const from = path.join(SRC, f);
  if (!fs.existsSync(from)) { console.warn("없음:", f); continue; }
  fs.copyFileSync(from, path.join(DST, f));
  n++;
}
console.log(`웹 파일 ${n}개를 www 폴더로 복사했어요.`);
