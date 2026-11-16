// 문장 안에서 부르는 소모임 이름: "독서" → "독서 모임". 이미 모임·회·클럽·동호회로 끝나면 그대로("골프회", "독서 모임").
// 게시글 제목 앞 [소모임] 표시와 목록·선택 칸은 원래 이름을 그대로 쓴다. 화면과 서버가 함께 쓴다.
export function clubLabel(name: string): string {
  const n = name.trim();
  if (!n) return n;
  return /(모임|회|클럽|동호회|club)$/i.test(n) ? n : `${n} 모임`;
}

// 받침에 맞는 조사: 을/를, 이/가, 은/는, 과/와, 으로/로
export function josa(word: string, pair: "을를" | "이가" | "은는" | "과와" | "으로로"): string {
  const c = word.trim().charCodeAt(word.trim().length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false;
  const rieul = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 === 8;
  if (pair === "으로로") return has && !rieul ? "으로" : "로";
  const [a, b] = [pair.slice(0, 1), pair.slice(1)];
  return has ? a : b;
}
