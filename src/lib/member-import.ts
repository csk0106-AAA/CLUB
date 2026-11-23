// 회원 명단 붙여넣기: CSV(쉼표) 또는 엑셀·구글 시트에서 복사한 표(탭)를 회원 행으로 바꾼다.

export type ImportRow = {
  name: string; kind: string; position: string; gender: string; company: string;
  title: string; birth: string; phone: string; ageGroup: string;
  edu: string; memo: string;
  id: string; // 회원ID(엑셀받기 파일). 있으면 새로 넣지 않고 그 회원을 고친다 // 교육이수(YES/NO 등 적은 그대로 — 넣을 때 eduYes 로 읽는다), 메모
  line?: number; // 붙여 넣은 글에서 몇 번째 줄인지(미리보기·안내용)
};
type Key = Exclude<keyof ImportRow, "line">;

// 머리글 이름 → 회원 항목(띄어쓰기·괄호·점은 빼고 비교, 영문은 소문자)
const HEADER: Record<string, Key> = {
  성명: "name", 이름: "name", 성함: "name", 회원명: "name", 회원이름: "name", name: "name",
  회원구분: "kind", 구분: "kind", 회원종류: "kind",
  직책: "position", 원우회직책: "position", 모임직책: "position",
  성별: "gender", gender: "gender",
  회사명: "company", 회사: "company", 소속: "company", 직장: "company", 기관: "company", company: "company",
  직위: "title", 직급: "title", title: "title",
  생년월일: "birth", 생일: "birth", 생년: "birth", 출생: "birth", birth: "birth",
  연락처: "phone", 전화: "phone", 전화번호: "phone", 휴대폰: "phone", 휴대전화: "phone", 핸드폰: "phone", 휴대폰번호: "phone", "휴대폰 번호": "phone", hp: "phone", phone: "phone", mobile: "phone",
  연령대: "ageGroup", 나이대: "ageGroup",
  교육이수: "edu", 이수: "edu", 교육: "edu",
  메모: "memo", 비고: "memo", memo: "memo",
  // 엑셀받기로 받은 파일의 회원ID: 있으면 그 회원 정보를 고친다
  회원id: "id", id: "id",
};
// 교육이수 칸: YES·O·예·이수·완료·true·1 이면 이수
export const eduYes = (v: string) => /^(yes|y|o|○|예|네|이수|완료|true|1)$/i.test(v.trim());
// 회원 항목은 아니지만 머리글 줄임을 알려 주는 이름(이 열은 건너뛴다)
const HEADER_ONLY = new Set(["no", "번호", "순번", "연번", "순서", "#"]);
export const norm = (h: string) => h.replace(/\(.*?\)|\[.*?\]/g, "").replace(/[\s.·:_-]/g, "").toLowerCase();

// 머리글이 없을 때의 열 순서 (목업 회원 명단 표와 같음, NO 열은 있으면 건너뜀)
const DEFAULT_ORDER: Key[] = ["name", "kind", "position", "gender", "company", "title", "birth", "phone", "ageGroup"];

// 글 전체를 표로 나눈다. 따옴표 안의 줄바꿈(엑셀에서 칸 안에 줄을 바꾼 경우)은 한 칸으로 본다.
export function splitTable(text: string, sep: string): { cells: string[]; line: number }[] {
  const rows: { cells: string[]; line: number }[] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  let line = 1;
  let start = 1;
  const t = text.replace(/\r\n?/g, "\n");
  const end = () => {
    row.push(cur.trim());
    if (row.some((c) => c)) rows.push({ cells: row, line: start });
    row = [];
    cur = "";
  };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else { if (c === "\n") { cur += " "; line++; } else cur += c; }
    } else if (c === '"' && cur.trim() === "") { q = true; cur = ""; }
    else if (c === sep) { row.push(cur.trim()); cur = ""; }
    else if (c === "\n") { end(); line++; start = line; }
    else cur += c;
  }
  end();
  return rows;
}

// present: 붙여 넣은 표에 있는 항목(엑셀로 고칠 때 없는 열은 그대로 두려고)
export function parseMembers(text: string): { rows: ImportRow[]; problems: string[]; present: string[] } {
  if (!text.trim()) return { rows: [], problems: [], present: [] };
  const firstLine = text.replace(/\r/g, "").split("\n").find((l) => l.trim()) ?? "";
  const sep = firstLine.includes("\t") ? "\t" : ",";
  const table = splitTable(text, sep);
  if (table.length === 0) return { rows: [], problems: [], present: [] };

  const head = table[0].cells.map(norm);
  const hasHeader = head.some((h) => h in HEADER || HEADER_ONLY.has(h));
  let cols: (Key | null)[];
  let body = table;
  if (hasHeader) {
    cols = head.map((h) => HEADER[h] ?? null);
    body = table.slice(1);
  } else {
    // 첫 열이 모두 숫자면 NO 열로 보고 건너뛴다.
    const skipNo = table.every((r) => /^\d+$/.test(r.cells[0] ?? ""));
    cols = skipNo ? [null, ...DEFAULT_ORDER] : DEFAULT_ORDER;
  }
  const problems: string[] = [];
  if (hasHeader && !cols.includes("name")) problems.push("머리글에 “성명” 열이 없어요. 첫 줄에 성명 열 이름을 넣어 주세요.");

  const rows: ImportRow[] = [];
  body.forEach(({ cells, line }) => {
    const r: ImportRow = { name: "", kind: "", position: "", gender: "", company: "", title: "", birth: "", phone: "", ageGroup: "", edu: "", memo: "", id: "", line };
    cols.forEach((k, j) => {
      if (k && cells[j] !== undefined) r[k] = cells[j];
    });
    if (!r.name) return void problems.push(`${line}번째 줄: 성명이 없어 건너뛰어요.`);
    // 표 중간에 다시 나온 머리글 줄, "합계" 같은 줄은 회원이 아니다
    const n = norm(r.name);
    if (n in HEADER || HEADER_ONLY.has(n) || /^(합계|소계|계|총계|total)$/.test(n) || /^\d+$/.test(n)) {
      return void problems.push(`${line}번째 줄(“${r.name}”): 회원 이름이 아니라서 건너뛰어요.`);
    }
    if (r.gender && !["남", "여"].includes(r.gender)) {
      const g = /^(m|male|남자|남성)$/i.test(r.gender) ? "남" : /^(f|female|여자|여성)$/i.test(r.gender) ? "여" : "";
      if (!g) problems.push(`${line}번째 줄(${r.name}): 성별 “${r.gender}”은 비워 둘게요.`);
      r.gender = g;
    }
    rows.push(r);
  });

  // 붙여 넣은 명단 안에서 같은 이름이 두 번 이상 나오면 알려 준다(같은 사람을 두 번 넣었을 수 있다)
  const seen = new Map<string, number[]>();
  rows.forEach((r) => seen.set(r.name, [...(seen.get(r.name) ?? []), r.line ?? 0]));
  for (const [name, lines] of seen) {
    if (lines.length > 1) problems.unshift(`“${name}”이(가) ${lines.length}번 있어요(${lines.join(", ")}번째 줄). 같은 사람이면 한 줄을 지워 주세요.`);
  }
  return { rows, problems, present: cols.filter((k): k is Key => !!k) };
}
