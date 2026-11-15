// 'npx cap add ios' 다음에 실행 (맥에서): 아이폰 앱에 권한 설명 문구(한국어)와 백그라운드 위치를 넣어요.
// 애플 심사: 권한을 물을 때 '왜 필요한지'를 구체적으로 적어야 통과해요. 문구가 없으면 앱이 바로 꺼지거나 심사에서 거절돼요.
const fs = require("fs");
const path = require("path");

const plist = path.join(__dirname, "ios", "App", "App", "Info.plist");
if (!fs.existsSync(plist)) {
  console.error("ios 폴더가 없어요. 먼저 맥에서 'npx cap add ios'를 실행하세요.");
  process.exit(1);
}
let xml = fs.readFileSync(plist, "utf8");

const strings = {
  // 📍 위치 — 운동 기록 중에만 사용
  NSLocationWhenInUseUsageDescription: "운동을 기록하는 동안 달린 거리·페이스·경로를 재기 위해 위치(GPS)를 사용해요. 기록하지 않을 때는 위치를 쓰지 않아요.",
  NSLocationAlwaysAndWhenInUseUsageDescription: "운동 기록 중 화면이 꺼지거나 다른 앱을 써도 거리·페이스를 계속 재기 위해 위치를 사용해요. 기록을 끝내면 위치 사용도 멈춰요.",
  NSLocationAlwaysUsageDescription: "운동 기록 중 화면이 꺼져도 거리·페이스를 계속 재기 위해 위치를 사용해요. 기록을 끝내면 위치 사용도 멈춰요.",
  // 📷 사진 — 커뮤니티 글·프로필 사진 올리기
  NSCameraUsageDescription: "커뮤니티 글이나 프로필에 올릴 사진을 찍기 위해 카메라를 사용해요.",
  NSPhotoLibraryUsageDescription: "커뮤니티 글이나 프로필에 올릴 사진을 고르기 위해 사진 보관함을 사용해요.",
  NSPhotoLibraryAddUsageDescription: "기록 공유 이미지를 사진 보관함에 저장하기 위해 사용해요.",
  // ❤️ 심박계 연결 (블루투스)
  NSBluetoothAlwaysUsageDescription: "블루투스 심박계를 연결해 운동 중 심박수를 보여 주기 위해 사용해요.",
};

let added = 0;
for (const [k, v] of Object.entries(strings)) {
  const re = new RegExp(`<key>${k}</key>\\s*<string>[^<]*</string>`);
  const entry = `<key>${k}</key>\n\t<string>${v}</string>`;
  if (re.test(xml)) xml = xml.replace(re, entry);
  else { xml = xml.replace(/<\/dict>\s*<\/plist>\s*$/, `\t${entry}\n</dict>\n</plist>\n`); added++; }
}

// 🔁 백그라운드에서도 운동 기록(위치)이 계속되게
if (!/<key>UIBackgroundModes<\/key>/.test(xml)) {
  xml = xml.replace(/<\/dict>\s*<\/plist>\s*$/, "\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t</array>\n</dict>\n</plist>\n");
  added++;
} else if (!/<string>location<\/string>/.test(xml.split("<key>UIBackgroundModes</key>")[1].split("</array>")[0])) {
  xml = xml.replace(/(<key>UIBackgroundModes<\/key>\s*<array>)/, "$1\n\t\t<string>location</string>");
  added++;
}

// 🇰🇷 앱 기본 언어: 한국어 (권한 창 버튼도 한국어로)
if (!/<key>CFBundleDevelopmentRegion<\/key>\s*<string>ko<\/string>/.test(xml)) {
  if (/<key>CFBundleDevelopmentRegion<\/key>/.test(xml)) xml = xml.replace(/(<key>CFBundleDevelopmentRegion<\/key>\s*<string>)[^<]*(<\/string>)/, "$1ko$2");
  else xml = xml.replace(/<\/dict>\s*<\/plist>\s*$/, "\t<key>CFBundleDevelopmentRegion</key>\n\t<string>ko</string>\n</dict>\n</plist>\n");
}

fs.writeFileSync(plist, xml);
console.log(`아이폰 권한 설명 문구를 넣었어요 (새로 추가 ${added}개, 나머지는 최신 문구로 바꿨어요).`);
