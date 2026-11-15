// 'npx cap add android' 다음에 실행: 안드로이드 앱에 위치(GPS) 권한과 백그라운드 알림 이름을 넣어요.
const fs = require("fs");
const path = require("path");

const manifest = path.join(__dirname, "android", "app", "src", "main", "AndroidManifest.xml");
if (!fs.existsSync(manifest)) {
  console.error("android 폴더가 없어요. 먼저 'npx cap add android'를 실행하세요.");
  process.exit(1);
}
let xml = fs.readFileSync(manifest, "utf8");
const perms = [
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-feature android:name="android.hardware.location.gps" />',
];
const missing = perms.filter((p) => !xml.includes(p.match(/name="([^"]+)"/)[1]));
if (missing.length) {
  xml = xml.replace("</manifest>", "    " + missing.join("\n    ") + "\n</manifest>");
  fs.writeFileSync(manifest, xml);
}
console.log(`위치 권한 ${missing.length}개를 추가했어요.`);

const strings = path.join(__dirname, "android", "app", "src", "main", "res", "values", "strings.xml");
if (fs.existsSync(strings)) {
  let s = fs.readFileSync(strings, "utf8");
  if (!s.includes("capacitor_background_geolocation_notification_channel_name")) {
    s = s.replace("</resources>", '    <string name="capacitor_background_geolocation_notification_channel_name">운동 기록</string>\n</resources>');
    fs.writeFileSync(strings, s);
    console.log("백그라운드 알림 이름을 넣었어요.");
  }
}
