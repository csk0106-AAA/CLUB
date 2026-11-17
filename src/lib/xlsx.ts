import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// 아주 작은 엑셀(.xlsx) 읽기·쓰기. 브라우저에서 쓴다(회원 명단 내려받기·양식·올리기).
// 쓰기: 시트 여러 개, 모든 칸은 글자(텍스트 서식 "@")로 넣어 연락처 앞의 0, 생년월일 모양이 그대로 남는다.
// 읽기: 첫 번째 시트의 칸 값을 글자로. 숫자로 저장된 날짜·연락처는 읽는 쪽에서 고친다(dateCols 참고).

export type Sheet = { name: string; rows: string[][]; widths?: number[]; boldFirst?: boolean };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // XML 에 넣을 수 없는 제어 문자는 뺀다(줄바꿈·탭은 둔다)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(sh: Sheet): string {
  const cols = sh.widths?.length
    ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1" style="1"/>`).join("")}</cols>`
    : "";
  const rows = sh.rows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      const ref = `${colName(ci)}${ri + 1}`;
      const style = sh.boldFirst && ri === 0 ? 2 : 1;
      return v === "" ? `<c r="${ref}" s="${style}"/>` : `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");
  const freeze = sh.boldFirst ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  // 스타일 0: 기본, 1: 텍스트 서식(@), 2: 텍스트 + 굵게 + 연한 배경(머리글)
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF1F5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(ct),
    "_rels/.rels": strToU8(rels),
    "xl/workbook.xml": strToU8(wb),
    "xl/_rels/workbook.xml.rels": strToU8(wbRels),
    "xl/styles.xml": strToU8(styles),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)); });
  return zipSync(files, { level: 6 });
}

// 브라우저에서 파일로 내려받기
export function downloadXlsx(name: string, sheets: Sheet[]) {
  const blob = new Blob([buildXlsx(sheets) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
};

// 첫 번째 시트를 글자 표로 읽는다. 빈 줄은 뺀다.
// numeric: 숫자로 저장된 칸인지(엑셀 날짜·연락처 고치기용)
export function readXlsx(data: Uint8Array): { rows: string[][]; numeric: boolean[][] } {
  const files = unzipSync(data);
  const text = (p: string) => (files[p] ? strFromU8(files[p]) : "");
  const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
  const tAll = (el: Element) => [...el.getElementsByTagName("t")].map((t) => t.textContent ?? "").join("");

  const shared = text("xl/sharedStrings.xml") ? [...parse(text("xl/sharedStrings.xml")).getElementsByTagName("si")].map(tAll) : [];
  // 첫 시트 파일 찾기(workbook 의 첫 sheet → rels)
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = text("xl/workbook.xml");
  const wbRels = text("xl/_rels/workbook.xml.rels");
  if (wb && wbRels) {
    const first = parse(wb).getElementsByTagName("sheet")[0];
    const rid = first?.getAttribute("r:id") ?? first?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = [...parse(wbRels).getElementsByTagName("Relationship")].find((r) => r.getAttribute("Id") === rid);
    const target = rel?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const xml = text(sheetPath);
  if (!xml) throw new Error("엑셀 시트를 찾지 못했어요.");
  const rows: string[][] = [];
  const numeric: boolean[][] = [];
  for (const row of [...parse(xml).getElementsByTagName("row")]) {
    const r: string[] = [];
    const nm: boolean[] = [];
    let next = 0;
    for (const c of [...row.getElementsByTagName("c")]) {
      const ref = c.getAttribute("r");
      const ci = ref ? colIndex(ref) : next;
      next = ci + 1;
      const t = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      let val = "";
      if (t === "s") val = shared[Number(v)] ?? "";
      else if (t === "inlineStr") val = c.getElementsByTagName("is")[0] ? tAll(c.getElementsByTagName("is")[0]) : "";
      else val = v;
      while (r.length < ci) { r.push(""); nm.push(false); }
      r[ci] = val.trim();
      nm[ci] = !t || t === "n";
    }
    if (r.some((x) => x)) { rows.push(r); numeric.push(nm); }
  }
  return { rows, numeric };
}

// 엑셀 날짜 일련번호(1900 기준) → "YYYY-MM-DD"
export function excelDate(serial: number): string {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return "";
  const ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}
