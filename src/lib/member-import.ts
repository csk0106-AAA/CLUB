// 회원 명단 붙여넣기: CSV(쉼표) 또는 엑셀·구글 시트에서 복사한 표(탭)를 회원 행으로 바꾼다.

export type ImportRow = {
  name: string; kind: string; position: string; gender: string; company: string;
  title: string; birth: string; phone: string; ageGroup: string;
};
type Key = keyof ImportRow;

// 머리글 이름 → 회원 항목
const HEADER: Record<string, Key> = {
  성명: "name", 이름: "name",
  회원구분: "kind", 구분: "kind",
  직책: "position", 원우회직책: "position",
  성별: "gender",
  회사명: "company", 회사: "company",
  직위: "title",
  생년월일: "birth", 생일: "birth",
  연락처: "phone", 전화: "phone", 전화번호: "phone", 휴대폰: "phone",
  연령대: "ageGroup",
};
// 머리글이 없을 때의 열 순서 (목업 회원 명단 표와 같음, NO 열은 있으면 건너뜀)
const DEFAULT_ORDER: Key[] = ["name", "kind", "position", "gender", "company", "title", "birth", "phone", "ageGroup"];

// 따옴표를 지원하는 한 줄 나누기
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseMembers(text: string): { rows: ImportRow[]; problems: string[] } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], problems: [] };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const table = lines.map((l) => splitLine(l, sep));

  const head = table[0].map((h) => h.replace(/\s/g, ""));
  const hasHeader = head.some((h) => h in HEADER);
  let cols: (Key | null)[];
  let body = table;
  if (hasHeader) {
    cols = head.map((h) => HEADER[h] ?? null);
    body = table.slice(1);
  } else {
    // 첫 열이 모두 숫자면 NO 열로 보고 건너뛴다.
    const skipNo = table.every((r) => /^\d+$/.test(r[0] ?? ""));
    cols = skipNo ? [null, ...DEFAULT_ORDER] : DEFAULT_ORDER;
  }

  const rows: ImportRow[] = [];
  const problems: string[] = [];
  body.forEach((cells, i) => {
    const r: ImportRow = { name: "", kind: "", position: "", gender: "", company: "", title: "", birth: "", phone: "", ageGroup: "" };
    cols.forEach((k, j) => {
      if (k && cells[j] !== undefined) r[k] = cells[j];
    });
    const line = i + (hasHeader ? 2 : 1);
    if (!r.name) return void problems.push(`${line}번째 줄: 성명이 없어 건너뛰어요.`);
    if (r.gender && !["남", "여"].includes(r.gender)) {
      const g = /^(m|male|남자|남성)$/i.test(r.gender) ? "남" : /^(f|female|여자|여성)$/i.test(r.gender) ? "여" : "";
      if (!g) problems.push(`${line}번째 줄(${r.name}): 성별 “${r.gender}”은 비워 둘게요.`);
      r.gender = g;
    }
    rows.push(r);
  });
  return { rows, problems };
}
