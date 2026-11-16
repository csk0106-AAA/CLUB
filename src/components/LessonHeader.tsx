import Link from "next/link";

// 활동 화면 맨 위 흰 띠(목업 C): 닫기(×) · 화면 제목 · 상태 칩, 아래 가장자리에 얇은 진행 막대 + n/m
export function LessonHeader(props: {
  href: string;
  closeLabel: string;
  title?: string;
  done?: number;
  total?: number;
  right?: React.ReactNode;
}) {
  const { href, closeLabel, title, done, total, right } = props;
  const hasProgress = typeof done === "number" && typeof total === "number" && total > 0;
  const pct = hasProgress ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <header className="lh">
      <div className="lh-row">
        <Link href={href} className="x" aria-label={closeLabel} title={closeLabel}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </Link>
        {title ? <h1 className="lh-t">{title}</h1> : <span className="grow" />}
        {hasProgress && <span className="lh-n num" aria-hidden="true">{done}/{total}</span>}
        {right}
      </div>
      {hasProgress && (
        <div className="prog" role="progressbar" aria-label={`진행 ${done}/${total}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
    </header>
  );
}
