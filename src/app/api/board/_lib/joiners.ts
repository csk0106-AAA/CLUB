import type { Row } from "@/lib/store/types";
import { postJoiners } from "@/lib/new-joiners";

// 게시 뒤 새로 가입한 회원 중 이 글의 공개 대상에 없는 사람(lib/new-joiners.ts)
export const newJoiners = (p: Row, members: Row[]) => postJoiners(p, members);
