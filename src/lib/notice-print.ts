// 일정 공지 인쇄 화면(새 창에 쓰는 HTML). 관리자가 인쇄 전에 그 자리에서 고친다:
//  - 글은 눌러서 바로 고치기(화면 전체가 편집 칸)
//  - 칸(마감 일정·세부일정·조편성 …)은 ⠿ 를 끌어 순서 바꾸기, "칸 지우기", 맨 아래 "＋ 안내 칸 추가"
//  - 세부일정은 일정 한 줄마다 ⠿ 로 끌어 순서 바꾸기, "＋ 안내"로 그 일정 아래에 안내 줄 추가
//  편집 도구(⠿·버튼)는 인쇄·PDF 에 나오지 않는다. 고친 내용은 그 PDF 에만 들어가고 앱에는 저장되지 않는다.
export type Notice = { title: string; body: string[]; sections: { title: string; lines: string[] }[]; footer: string[] };

// 글자를 HTML 에 넣을 때 꺾쇠·& 를 바꾼다
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// 줄 앞 공백은 들여쓰기로 살린다
const line = (t: string) => {
  const pad = /^ */.exec(t)![0].length;
  const head = /^(🔹|➡|⬅|🗓)/.test(t.trim()) ? " head" : "";
  return t.trim() ? `<div class="ln${head}" style="padding-left:${pad * 0.45}em">${esc(t.trim())}</div>` : `<div class="gap"></div>`;
};
const TOOLS_BOX = `<span class="bt" contenteditable="false"><button type="button" class="note-add">＋ 안내</button><button type="button" class="up" title="위로">▲</button><button type="button" class="down" title="아래로">▼</button><span class="h" draggable="true" title="끌어서 칸 순서 바꾸기">⠿</span><button type="button" class="x">칸 지우기</button></span>`;

// 세부일정: 날짜 줄(🗓)은 그대로, 일정 줄(🕑)과 그 아래 장소·메모 줄을 한 묶음으로(끌어서 옮기기·안내 추가)
function scheduleHtml(lines: string[]): string {
  const out: string[] = [];
  let item: string[] | null = null;
  const flush = () => {
    if (!item) return;
    out.push(`<div class="item"><span class="it" contenteditable="false"><span class="h" draggable="true" title="끌어서 일정 순서 바꾸기">⠿</span></span><div class="ib">${item.join("")}</div><span class="it2" contenteditable="false"><button type="button" class="add">＋ 안내</button></span></div>`);
    item = null;
  };
  for (const l of lines) {
    const t = l.trim();
    if (t.startsWith("🗓")) { flush(); out.push(`<div class="day">${esc(t)}</div>`); }
    else if (t.startsWith("🕑")) { flush(); item = [line(l.replace(/^ {0,2}/, ""))]; }
    else if (!t) { flush(); out.push(`<div class="gap"></div>`); }
    else if (item) item.push(line(l.replace(/^ {0,2}/, "")));
    else out.push(line(l));
  }
  flush();
  return out.join("");
}

// 인쇄 화면 스크립트(ES5, 따옴표만 쓴다)
const SCRIPT = `
var doc = document.getElementById("doc");
function sel(el){ var r=document.createRange(); r.selectNodeContents(el); var s=getSelection(); s.removeAllRanges(); s.addRange(r); el.scrollIntoView({block:"center"}); }
document.addEventListener("click", function(e){
  var t = e.target;
  if (t.classList.contains("x")) { var box=t.closest(".box"); if (box && confirm("이 칸을 지울까요?")) box.remove(); }
  if (t.classList.contains("note-add")) {
    var bx = t.closest(".box"); var h = bx.querySelector("h2");
    var n = document.createElement("div"); n.className="ln note"; n.textContent="📢 안내를 적어 주세요";
    if (h) h.parentNode.insertBefore(n, h.nextSibling); else bx.insertBefore(n, t.closest(".bt").nextSibling);
    sel(n);
  }
  if (t.classList.contains("up") || t.classList.contains("down")) {
    var me = t.closest(".box");
    if (t.classList.contains("up")) { var p = me.previousElementSibling; if (p && p.classList.contains("box")) me.parentNode.insertBefore(me, p); }
    else { var nx = me.nextElementSibling; if (nx && nx.classList.contains("box") && nx.id !== "foot") me.parentNode.insertBefore(nx, me); }
    me.scrollIntoView({block:"nearest"});
  }
  if (t.classList.contains("add")) {
    var ib = t.closest(".item").querySelector(".ib");
    var d = document.createElement("div"); d.className="ln note"; d.style.paddingLeft="3.6em"; d.textContent="📢 안내를 적어 주세요";
    ib.appendChild(d); sel(d);
  }
});
function addBox(){
  var box=document.createElement("div"); box.className="box";
  box.innerHTML='${TOOLS_BOX.replace(/'/g, "\\'")}<h2>📢 안내</h2><div class="ln">여기에 안내를 적어 주세요.</div>';
  doc.insertBefore(box, document.getElementById("foot")); sel(box.querySelector(".ln"));
}
// 끌어서 순서 바꾸기: 칸은 칸끼리(맨 위 제목·맨 아래 로그인 안내 칸은 고정), 세부일정 일정은 같은 세부일정 칸 안에서
var drag = null;
document.addEventListener("dragstart", function(e){
  if (!e.target.classList || !e.target.classList.contains("h")) return;
  drag = e.target.closest(".item") || e.target.closest(".box");
  e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain","");
  drag.classList.add("dragging");
});
document.addEventListener("dragend", function(){ if (drag) drag.classList.remove("dragging"); drag=null; });
document.addEventListener("dragover", function(e){
  if (!drag) return;
  if (e.clientY < 60) window.scrollBy(0, -20); else if (e.clientY > innerHeight - 60) window.scrollBy(0, 20);
  var isItem = drag.classList.contains("item");
  var over = isItem ? e.target.closest(".item, .day") : e.target.closest(".box");
  if (!over || over===drag) { if (drag) e.preventDefault(); return; }
  if (isItem && over.closest(".box") !== drag.closest(".box")) return;
  if (!isItem && (over.id==="foot")) return;
  e.preventDefault();
  var r = over.getBoundingClientRect();
  var after = e.clientY > r.top + r.height/2;
  if (isItem && over.classList.contains("day")) after = true;
  over.parentNode.insertBefore(drag, after ? over.nextSibling : over);
});
document.addEventListener("drop", function(e){ if (drag) e.preventDefault(); });
`;

export function noticeHtml(n: Notice, name: string): string {
  const link = n.footer[n.footer.length - 1];
  const sec = (x: Notice["sections"][number]) => {
    const sched = x.title.startsWith("🗒");
    return `<div class="box${sched ? " sched" : ""}">${TOOLS_BOX}<h2>${esc(x.title)}</h2>${sched ? scheduleHtml(x.lines) : x.lines.map(line).join("")}</div>`;
  };
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(name)}</title>
<style>
/* 보내 주신 공지(워드 PDF)의 배치: 흰 바탕, 칸 제목 위아래 짧은 줄, 넉넉한 줄 간격. 아이콘은 컬러 그대로.
   편집 도구는 마우스를 올릴 때만 또렷하게, 인쇄에는 안 나온다 */
@page { size: A4; margin: 18mm 20mm; }
* { box-sizing: border-box; }
body { margin: 0; padding: 28px 24px; background: #fff; color: #111;
  font: 14.5px/2 "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif; }
.page { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
#doc { display: flex; flex-direction: column; gap: 40px; }
h1 { margin: 0 0 6px; font-size: 22px; line-height: 1.5; font-weight: 800; }
.box { position: relative; break-inside: avoid; page-break-inside: avoid; }
.box.sched { break-inside: auto; page-break-inside: auto; }
/* 칸 제목: 위아래 짧은 줄(━━ 대신) */
.box h2 { position: relative; margin: 0 0 14px; font-size: 15px; font-weight: 600; padding: 10px 0; padding-right: 230px; }
.box h2::before, .box h2::after { content: ""; position: absolute; left: 0; width: 220px; border-top: 1px solid #111; }
.box h2::before { top: 0; } .box h2::after { bottom: 0; }
.ln { overflow-wrap: anywhere; margin: 4px 0; }
.ln.head { margin-top: 16px; font-weight: 600; }
.box h2 + .ln.head, .box .bt + h2 + .ln.head { margin-top: 4px; }
.ln.note { padding-left: 0 !important; }
.gap { height: 14px; }
.day { margin: 18px 0 6px; font-weight: 600; }
.item { display: flex; align-items: flex-start; gap: 4px; margin: 10px 0; break-inside: avoid; page-break-inside: avoid; }
.ib { flex: 1; min-width: 0; padding-left: 0.9em; }
.it, .it2 { flex: none; user-select: none; opacity: 0; transition: opacity .15s; }
.item:hover .it, .item:hover .it2, .item:focus-within .it, .item:focus-within .it2 { opacity: 1; }
.h { cursor: grab; color: #888; font-size: 13px; padding: 0 4px; border-radius: 4px; line-height: 1.6; }
.bt button, .add { font: 12px/1.6 sans-serif; border: 1px solid #ccc; background: #fff; color: #444; border-radius: 6px; padding: 1px 7px; cursor: pointer; white-space: nowrap; }
.bt { position: absolute; top: 8px; right: 0; display: flex; gap: 4px; align-items: center; user-select: none; opacity: .45; z-index: 1; }
.box:hover .bt, .box:focus-within .bt { opacity: 1; }
.bt .h { border: 1px solid #ccc; background: #fff; font: 12px/1.6 sans-serif; padding: 1px 7px; }
.box:not(:has(h2)) .bt { top: -26px; }
.dragging { opacity: .4; outline: 1px dashed #888; }
.tools { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; padding-bottom: 12px; border-bottom: 1px solid #ddd; }
.tools button { font: 14px sans-serif; font-weight: 700; padding: 7px 14px; border-radius: 8px; border: 1px solid #333; background: #333; color: #fff; cursor: pointer; }
.tools button.sub { background: #fff; color: #333; }
.tools .hint { flex: 1 1 300px; align-self: center; color: #666; font-size: 13px; line-height: 1.6; }
[contenteditable="true"]:focus { outline: none; }
.ln:focus { outline: 1px dashed #888; }
@media print {
  body { padding: 0; }
  /* 페이지 나눔이 잘 되게 인쇄에서는 블록 배치로(플렉스 안에서는 "나누지 않기"가 잘 안 먹는다)
     일정 한 묶음(시각 + 장소·메모·안내)은 페이지 중간에서 자르지 않고 다음 페이지로 넘긴다.
     한 묶음이 한 페이지보다 길면 그 안에서는 나뉜다. 날짜 줄은 다음 일정과 붙여 둔다 */
  .page, #doc { display: block !important; }
  #doc > * + * { margin-top: 40px; }
  .item { display: block !important; break-inside: avoid; page-break-inside: avoid; }
  .ib { padding-left: 0.9em; }
  .day, .box h2, .ln.head { break-after: avoid; page-break-after: avoid; }
  .tools, .bt, .it, .it2 { display: none !important; }
  .box h2 { padding-right: 0; }
}
</style></head><body><div class="page">
<div class="tools"><span class="hint">글을 눌러 바로 고쳐요. 칸이나 일정 위에 마우스를 올리면 “＋ 안내”(칸 제목 아래·일정 아래에 안내 줄), ▲▼·⠿(순서 바꾸기)가 보여요. 편집 표시는 인쇄에 나오지 않아요.</span><button class="sub" type="button" onclick="addBox()">＋ 안내 칸 추가</button><button type="button" onclick="window.print()">인쇄 · PDF로 저장</button></div>
<div id="doc" contenteditable="true" spellcheck="false">
<h1>${esc(n.title)}</h1>
<div class="box">${TOOLS_BOX}${n.body.map(line).join("")}</div>
${n.sections.map(sec).join("\n")}
<div class="box" id="foot">${n.footer.slice(0, -1).map(line).join("")}<div class="ln">${esc(link)}</div></div>
</div></div>
<script>${SCRIPT}</script>
</body></html>`;
}
