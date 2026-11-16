// 동명이인 막기: 회원 이름은 키가 아니지만(키는 회원 id) 로그인 화면에서 이름으로 고르므로 겹치지 않게 한다.
// 같은 이름이 이미 있으면 이름 뒤에 알파벳을 순서대로 붙인다: 김하늘 → 김하늘B → 김하늘C …(먼저 있던 회원은 그대로, A 는 쓰지 않음)
// Z 까지 다 쓰면 숫자(김하늘27 …).
export function uniqueName(name: string, taken: Iterable<string>): string {
  const n = name.trim();
  const used = new Set([...taken].map((x) => x.trim()));
  if (!used.has(n)) return n;
  for (let c = 66; c <= 90; c++) {
    const v = `${n}${String.fromCharCode(c)}`;
    if (!used.has(v)) return v;
  }
  for (let i = 27; ; i++) if (!used.has(`${n}${i}`)) return `${n}${i}`;
}
