import type { Audience } from "@/lib/audience";
import type { AvatarView } from "@/lib/avatar";
import type { FileMeta, Form, Template } from "@/lib/board";

// 게시판 화면에서 쓰는 API 응답 모양 (/api/board …)
export type BoardMe = { canWrite: boolean; manage: boolean; isAll: boolean; tplAdmin: boolean };

export type PostSummary = {
  id: string;
  form: Form;
  title: string;
  excerpt: string;
  notice: boolean;
  pinned: boolean;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  thumb: string;
  responded: boolean;
  closed: boolean;
  audienceText: string;
  // 투표·설문 글: 대상 인원·참여 인원·마감("" 없음)
  vote?: { target: number; done: number; deadline: string } | null;
  mine: boolean;
  // 마지막으로 알림을 본 뒤: "new" 새로 올라온 글, "updated" 수정된 글(종 아이콘 숫자에 센 글과 같다)
  fresh: "" | "new" | "updated";
  // 반응 수·댓글 수
  reactions: number;
  comments: number;
  // 게시 뒤 새로 가입했는데 공개 대상에 없는 회원 수(작성자·편집자, 회칙·회비 글은 그 관리자에게만)
  newJoiners?: number;
  manageHref?: string; // 회칙·회비 글의 관리 화면
};

// 반응·댓글 (/api/board/[id] 의 talk, /api/board/[id]/reactions·comments 응답)
export type PostTalk = {
  reactions: { type: string; count: number; mine: boolean; names: string[] }[];
  comments: {
    id: string; name: string; avatar: AvatarView; body: string;
    createdAt: string; edited: boolean; canEdit: boolean; canDelete: boolean;
    likes: number; liked: boolean; parentId: string; // 좋아요·답글(components/CommentThread.tsx)
  }[];
};

export type PostFull = {
  id: string;
  postFrom?: string; postUntil?: string; // 게시 기간(비면 계속 게시)
  form: Form;
  title: string;
  body: string;
  data: Record<string, unknown>;
  audience: Audience;
  audienceText: string;
  // 투표·설문 글: 대상 인원·참여 인원·마감("" 없음)
  vote?: { target: number; done: number; deadline: string } | null;
  notice: boolean;
  pinned: boolean;
  files: FileMeta[];
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type ClubJoinState = { id: string; status: string; reason: string; message: string; createdAt: string; handledAt: string } | null;

export type PostDetail = {
  post: PostFull;
  canEdit: boolean;
  // 게시 뒤 새로 가입했는데 공개 대상에 없는 회원(작성자·편집자에게만)
  newJoiners?: { id: string; name: string }[];
  // 회칙·회비 글: 고칠 수 있는 사람에게만 관리 화면 주소(없으면 "")
  manageHref: string;
  canDelete: boolean;
  editors?: { id: string; name: string }[]; // 편집자(작성자가 추가)
  canManageEditors?: boolean; // 편집자를 바꿀 수 있는지(작성자·모든권한)
  seeResults: boolean;
  mine: unknown;
  results: unknown;
  rules?: { id: string; chapter: string; article: string; body: string; version: string }[];
  // notMember: 클럽 회비 글인데 그 클럽 회원이 아님(금액 대신 "○○ 회원이 아닙니다" + 가입 신청)
  myFee?: { amount: string; kind: string; position: string; notMember?: boolean };
  // 클럽 회원이 아닐 때 그 클럽 가입 신청 상태(최근 것, 없으면 null)
  clubJoin?: ClubJoinState;
  agendaLabels?: Record<string, string>;
  // 반응·댓글(회칙·회비 글은 null)
  talk: PostTalk | null;
};

export type BoardMeta = {
  templates: Record<Form, Template>;
  kinds: string[];
  positions: string[];
  agendaLabels: Record<string, string>;
  aiEnabled?: boolean;
  clubs?: string[];
  me: BoardMe & { id: string };
};

export const fileUrl = (id: string) => `/api/board/files/${encodeURIComponent(id)}`;
