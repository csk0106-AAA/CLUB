// 대표사진 주소 끝의 "#f=x,y"(보일 중심점, %)를 읽어 <img> 의 object-position 으로 쓴다(lib/covers.ts coverUrl).
// 중심점이 없으면 가운데. 회원이 올린 사진 주소에는 붙지 않으므로 그대로 가운데.
export function focusPos(url: string | undefined | null): string {
  const m = /#f=(\d{1,3}),(\d{1,3})$/.exec(url ?? "");
  return m ? `${Math.min(100, Number(m[1]))}% ${Math.min(100, Number(m[2]))}%` : "50% 50%";
}
export const focusStyle = (url: string | undefined | null) => ({ objectPosition: focusPos(url) });
