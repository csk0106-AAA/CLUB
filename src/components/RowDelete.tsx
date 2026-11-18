"use client";

// 목록의 한 줄 지우기 버튼(⊖ 빨간 마이너스 아이콘). 세부일정·준비목록·비용·회원 구분 목록·양식 줄 등에서 같은 모양으로 쓴다.
// 카드·일정·템플릿처럼 큰 단위를 지우는 버튼은 실수로 누르지 않도록 글자 버튼 그대로 둔다.
export function RowDelete({ label, onClick, disabled, className = "" }: { label: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" className={`sic sic-del ${className}`.trim()} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M8 12h8" />
      </svg>
    </button>
  );
}
