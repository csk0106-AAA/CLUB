import { randomInt } from "node:crypto";

// 랜덤 별칭(닉네임): "느긋한 고래"처럼 꾸밈말 + 이름. '내가 누굴까요?' 참여 회원이 프로필 북에서 실명 대신 쓴다.
// 회원이 활동 화면에서 바꿀 수 있다(lib/who.ts 별칭 규칙: 2~20자, 다른 회원과 겹치지 않게).
const ADJ = [
  "느긋한", "반짝이는", "용감한", "조용한", "다정한", "호기심 많은", "부지런한", "엉뚱한", "씩씩한", "포근한",
  "명랑한", "차분한", "재빠른", "수줍은", "든든한", "유쾌한", "꼼꼼한", "따뜻한", "날렵한", "느릿한",
  "상냥한", "당찬", "말랑한", "새침한", "듬직한", "산뜻한", "푸근한", "총명한", "쾌활한", "단단한",
];
const NOUN = [
  "고래", "부엉이", "다람쥐", "여우", "판다", "펭귄", "수달", "고슴도치", "사슴", "돌고래",
  "참새", "거북이", "토끼", "코알라", "해달", "두루미", "너구리", "올빼미", "물개", "기린",
  "나비", "반딧불", "곰", "알파카", "미어캣", "홍학", "청설모", "치타", "앵무새", "해파리",
];

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// 쓰고 있는 별칭과 겹치지 않는 랜덤 별칭
export function randomNickname(taken: Iterable<string>): string {
  const used = new Set([...taken].map(norm));
  for (let i = 0; i < 200; i++) {
    const a = `${ADJ[randomInt(ADJ.length)]} ${NOUN[randomInt(NOUN.length)]}`;
    if (!used.has(norm(a))) return a;
  }
  // 다 겹치면 숫자를 붙인다
  for (let n = 2; ; n++) {
    const a = `${ADJ[randomInt(ADJ.length)]} ${NOUN[randomInt(NOUN.length)]} ${n}`;
    if (!used.has(norm(a))) return a;
  }
}
