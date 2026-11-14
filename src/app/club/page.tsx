import { redirect } from "next/navigation";

// 예전 "원우회 정보" 화면: 조직도는 하단 "조직도" 탭(/org), 회칙은 게시글의 회칙 글로 옮겼다.
export default function ClubPage() {
  redirect("/org");
}
