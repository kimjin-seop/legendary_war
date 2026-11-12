<?php

namespace App\Http\Controllers;

use App\Game\IllegalAction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** 채팅 운영(관리자 전용: routes 의 admin 미들웨어). 신고 큐 조회·메시지 소프트 삭제. 삭제도 audit_logs 에 남긴다. */
class AdminChatController extends Controller
{
    /** GET ?status=open(기본: 메시지가 아직 살아 있는 신고)|all &page= */
    public function reports(Request $request): JsonResponse
    {
        $d = $request->validate(['status' => ['sometimes', 'in:open,all']]);
        $q = DB::table('chat_reports as r')
            ->leftJoin('room_messages as m', 'm.id', '=', 'r.message_id')
            ->leftJoin('rooms', 'rooms.id', '=', 'm.room_id')
            ->leftJoin('users as t', 't.id', '=', 'r.target_user_id')
            ->leftJoin('users as rp', 'rp.id', '=', 'r.reporter_user_id')
            ->orderByDesc('r.id');
        if (($d['status'] ?? 'open') === 'open') {
            $q->whereNull('r.handled_at');   // 미처리 신고(메시지 삭제·처리 완료·제재 시 자동 처리됨)
        }
        $page = $q->select(['r.id', 'r.message_id', 'r.reason', 'r.body', 'r.counts', 'r.created_at', 'r.handled_at', 'r.handled_action', 'rooms.code as room_code', 'm.deleted_at as message_deleted_at',
            'r.target_user_id', 't.name as target_name', 't.chat_restricted_until as target_restricted_until', 'r.reporter_user_id', 'rp.name as reporter_name'])->paginate(50);

        return response()->json($page);
    }

    /** DELETE: room_messages.deleted_at 설정(본문은 신고 스냅샷으로 보존). 이미 삭제됐으면 already_deleted=true */
    public function deleteMessage(Request $request, int $id): JsonResponse
    {
        $m = DB::table('room_messages')->where('id', $id)->first() ?? throw new IllegalAction('message_not_found', '메시지가 없습니다.', 404);
        if ($m->deleted_at) {
            return response()->json(['ok' => true, 'already_deleted' => true]);
        }
        DB::transaction(function () use ($request, $m) {
            $n = DB::table('room_messages')->where('id', $m->id)->whereNull('deleted_at')->update(['deleted_at' => now()]);
            $n > 0 && DB::table('chat_reports')->where('message_id', $m->id)->whereNull('handled_at')
                ->update(['handled_at' => now(), 'handled_by_user_id' => $request->user()->id, 'handled_action' => 'deleted']);
            $n > 0 && DB::table('audit_logs')->insert([
                'user_id' => $request->user()->id, 'action' => 'chat_delete', 'entity' => 'room_messages', 'entity_key' => (string) $m->id,
                'before' => json_encode(['deleted_at' => null, 'room_id' => (int) $m->room_id, 'author_user_id' => (int) $m->user_id]), 'after' => json_encode(['deleted' => true]), 'created_at' => now(),
            ]);
        });

        return response()->json(['ok' => true, 'already_deleted' => false]);
    }

    /** POST {action:dismissed|resolved, note?}: 신고 처리 완료 표시(멱등). 삭제/제재는 각 엔드포인트가 자동으로 처리 완료 표시 */
    public function handle(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['action' => ['required', 'in:dismissed,resolved'], 'note' => ['sometimes', 'nullable', 'string', 'max:200']]);
        $r = DB::table('chat_reports')->where('id', $id)->first() ?? throw new IllegalAction('report_not_found', '신고가 없습니다.', 404);
        if ($r->handled_at) {
            return response()->json(['ok' => true, 'already_handled' => true, 'handled_action' => $r->handled_action]);
        }
        $n = DB::table('chat_reports')->where('id', $id)->whereNull('handled_at')->update(['handled_at' => now(), 'handled_by_user_id' => $request->user()->id, 'handled_action' => $d['action']]);
        $n > 0 && $this->audit($request, 'chat_report_'.$d['action'], 'chat_reports', $id, ['handled_at' => null], ['note' => $d['note'] ?? null]);

        return response()->json(['ok' => true, 'already_handled' => $n === 0, 'handled_action' => $d['action']]);
    }

    /** POST {minutes:1..43200, reason(5~200)}: 수동 채팅 제재 부여(기존 users.chat_restricted_until 재사용, 더 긴 기존 제재는 줄이지 않음). 대상의 미처리 신고는 sanctioned 로 처리 */
    public function restrict(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['minutes' => ['required', 'integer', 'min:1', 'max:43200'], 'reason' => ['required', 'string', 'min:5', 'max:200']]);
        $u = DB::table('users')->where('id', $id)->first() ?? throw new IllegalAction('not_found', '유저가 없습니다.', 404);
        if ($u->role === 'admin') {
            throw new IllegalAction('cannot_restrict_admin', '관리자 계정은 제재할 수 없습니다.', 422);
        }
        $until = now()->addMinutes((int) $d['minutes']);
        if ($u->chat_restricted_until && Carbon::parse($u->chat_restricted_until)->gt($until)) {
            $until = Carbon::parse($u->chat_restricted_until);
        }
        DB::transaction(function () use ($request, $u, $until, $d) {
            DB::table('users')->where('id', $u->id)->update(['chat_restricted_until' => $until, 'chat_sanctioned_at' => now()]);
            DB::table('chat_reports')->where('target_user_id', $u->id)->whereNull('handled_at')->update(['handled_at' => now(), 'handled_by_user_id' => $request->user()->id, 'handled_action' => 'sanctioned']);
            $this->audit($request, 'chat_restrict', 'users', $u->id, ['chat_restricted_until' => $u->chat_restricted_until], ['chat_restricted_until' => $until->toDateTimeString(), 'minutes' => (int) $d['minutes'], 'reason' => $d['reason']]);
        });

        return response()->json(['ok' => true, 'restricted_until' => $until->toIso8601String()]);
    }

    /** POST {reason}: 채팅 제재 해제(이후 신고부터 다시 카운트: chat_sanctioned_at 갱신) */
    public function unrestrict(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:200']]);
        $u = DB::table('users')->where('id', $id)->first() ?? throw new IllegalAction('not_found', '유저가 없습니다.', 404);
        DB::transaction(function () use ($request, $u, $d) {
            DB::table('users')->where('id', $u->id)->update(['chat_restricted_until' => null, 'chat_sanctioned_at' => now()]);
            $this->audit($request, 'chat_unrestrict', 'users', $u->id, ['chat_restricted_until' => $u->chat_restricted_until], ['chat_restricted_until' => null, 'reason' => $d['reason']]);
        });

        return response()->json(['ok' => true, 'restricted_until' => null]);
    }

    private function audit(Request $r, string $action, string $entity, string|int|null $key, ?array $before, ?array $after): void
    {
        DB::table('audit_logs')->insert([
            'user_id' => $r->user()->id, 'action' => $action, 'entity' => $entity, 'entity_key' => $key === null ? null : (string) $key,
            'before' => $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE), 'after' => $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE), 'created_at' => now(),
        ]);
    }
}
