import { NextResponse } from "next/server";
import { z } from "zod";
import { bad } from "@/lib/api";
import { avatarView } from "@/lib/avatar";
import { COMMENT_MAX, REACTIONS, talkable } from "@/lib/board";
import { getStore } from "@/lib/store";
import { likesOf, threadOrder } from "@/lib/comments";
import type { Row } from "@/lib/store/types";
import { canSee, findPost, getMe, type Me } from "./server";

// 게시글 반응(좋아요 등)과 댓글.
//  - 글을 볼 수 있는 회원(공개 대상 + 작성자)만 읽고 남길 수 있다. 진행자 접속 세션은 getMe(guard)에서 막힌다.
//  - 관리 화면에서 올린 회칙·회비 글은 받지 않는다(400).

export type Talk = {
  reactions: { type: string; count: number; mine: boolean; names: string[] }[];
  comments: {
    id: string; name: string; avatar: ReturnType<typeof avatarView>; body: string;
    createdAt: string; edited: boolean; canEdit: boolean; canDelete: boolean;
    likes: number; liked: boolean; parentId: string; // 좋아요 수·내가 눌렀는지·답글이면 원댓글 id
  }[];
};

export const commentInput = z.object({
  body: z.string().trim().min(1, "댓글 내용을 적어 주세요.").max(COMMENT_MAX, `댓글은 ${COMMENT_MAX}자까지 쓸 수 있어요.`),
  parentId: z.string().max(80).optional(), // 답글이면 원댓글 id
});

// 반응·댓글 API 공통: 로그인 + 글 찾기 + 볼 수 있는지 + 받는 글인지
export async function talkTarget(id: string): Promise<{ me: Me; post: Row } | { err: NextResponse }> {
  const m = await getMe();
  if ("err" in m) return { err: m.err };
  const post = await findPost(id);
  if (!post || !canSee(m.me, post)) return { err: bad("글을 찾을 수 없어요.", 404) };
  if (!talkable(post.form)) return { err: bad("회칙·회비 안내 글에는 반응과 댓글을 남길 수 없어요.") };
  return { me: m.me, post };
}

export async function talkOf(me: Me, postId: string): Promise<Talk> {
  const s = await getStore();
  const [members, reactions, comments] = await Promise.all([s.list("Members"), s.list("PostReactions"), s.list("PostComments")]);
  const byId = new Map(members.map((m) => [m.id, m]));
  const mine = reactions.filter((r) => r.postId === postId);
  return {
    reactions: REACTIONS.map(({ key }) => {
      const rs = mine.filter((r) => r.type === key).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
      return { type: key, count: rs.length, mine: rs.some((r) => r.memberId === me.row.id), names: rs.map((r) => byId.get(r.memberId)?.name ?? "(지운 회원)") };
    }),
    comments: threadOrder(comments.filter((c) => c.postId === postId))
      .map((c) => {
        const m = byId.get(c.memberId);
        const own = c.memberId === me.row.id;
        return {
          id: c.id, name: m?.name ?? "(지운 회원)", avatar: m ? avatarView(m) : null, body: c.body,
          createdAt: c.createdAt, edited: !!c.updatedAt && c.updatedAt !== c.createdAt,
          canEdit: own, canDelete: own || me.manage,
          likes: likesOf(c).length, liked: likesOf(c).includes(me.row.id), parentId: c.parentId ?? "",
        };
      }),
  };
}

// 게시글을 지울 때 반응·댓글도 함께 지운다.
export async function removeTalk(postId: string): Promise<void> {
  const s = await getStore();
  for (const r of (await s.list("PostReactions")).filter((r) => r.postId === postId)) await s.remove("PostReactions", r.id);
  for (const c of (await s.list("PostComments")).filter((c) => c.postId === postId)) await s.remove("PostComments", c.id);
}

// 홈 목록용: 글 id → 반응 수·댓글 수
export async function talkCounts(): Promise<Map<string, { reactions: number; comments: number }>> {
  const s = await getStore();
  const [reactions, comments] = await Promise.all([s.list("PostReactions"), s.list("PostComments")]);
  const out = new Map<string, { reactions: number; comments: number }>();
  const get = (id: string) => out.get(id) ?? (out.set(id, { reactions: 0, comments: 0 }), out.get(id)!);
  for (const r of reactions) get(r.postId).reactions++;
  for (const c of comments) get(c.postId).comments++;
  return out;
}
