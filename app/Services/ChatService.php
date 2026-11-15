<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * 방 채팅(pvp 전용, 폴링). 규칙:
 * - 방 참가자만 읽기/쓰기(비참가자 403 not_room_member). solo 방은 상대가 없어 409 chat_not_available.
 * - 쓰기는 waiting/deployment/in_progress에서만, 읽기는 종료(finished/closed) 후 read_grace_minutes까지.
 * - 응답에는 user_id/이메일을 싣지 않는다(side + 표시명). 표시명 = 주인공 표시명 규칙('#' 앞, 최대 12자).
 * - 저장: body는 정규화된 원문(body_raw=true), 응답 view에서만 htmlspecialchars. body_raw=false인 기존 행은 이미 이스케이프된 값이라 그대로 내보낸다.
 * - 대기 방 재입장 등: 참가자는 자기 room_players.created_at 이후 메시지만 본다.
 * - 뮤트: 수신자가 뮤트면 메시지는 hidden_from_side로 저장되어 그 수신자에게는 (뮤트 해제 후에도) 노출되지 않는다.
 *   발신자에게는 정상 전송처럼 응답(차단 사실을 알려 보복/우회하지 않게 함). 내가 뮤트 중이면 전송은 409 chat_muted(UI가 해제 유도).
 */
class ChatService
{
    private function cfg(string $k, mixed $d = null): mixed
    {
        return config("chat.$k", $d);
    }

    /** @return array{0:object,1:object} [room, me] */
    private function member(User $user, string $code): array
    {
        $room = DB::table('rooms')->where('code', strtoupper($code))->first();
        $me = $room ? DB::table('room_players')->where(['room_id' => $room->id, 'user_id' => $user->id])->first() : null;
        if (! $room || ! $me) {
            throw new IllegalAction('not_room_member', '방 참가자만 채팅할 수 있습니다.', 403);
        }
        if ($room->mode !== 'pvp') {
            throw new IllegalAction('chat_not_available', '대인전 방에서만 채팅할 수 있습니다.', 409);
        }

        return [$room, $me];
    }

    private function isOpen(object $room): bool
    {
        return in_array($room->status, ['waiting', 'deployment', 'in_progress'], true);
    }

    private function assertReadable(object $room): void
    {
        if (! $this->isOpen($room) && Carbon::parse($room->updated_at)->lt(now()->subMinutes((int) $this->cfg('read_grace_minutes', 30)))) {
            throw new IllegalAction('chat_expired', '종료된 지 오래된 방의 채팅은 볼 수 없습니다.', 410);
        }
    }

    private function name(User $u): string
    {
        return app(ProtagonistService::class)->displayName($u);
    }

    public function presets(): array
    {
        $out = [];
        foreach ((array) $this->cfg('quick_presets', []) as $id => $text) {
            $out[] = ['id' => (string) $id, 'text' => $text];
        }

        return $out;
    }

    /** @return array{0:bool,1:?string} [보낼 수 있는지, 불가 사유 코드] */
    private function sendState(User $user, object $room, object $me): array
    {
        if (! $this->isOpen($room)) {
            return [false, 'chat_closed'];
        }
        if ($user->chat_restricted_until && Carbon::parse($user->chat_restricted_until)->isFuture()) {
            return [false, 'chat_restricted'];
        }
        if ($me->chat_muted) {
            return [false, 'chat_muted'];
        }

        return [true, null];
    }

    /** GET messages: since_id 이후(0=최근 page_size개). read=true면 안 읽음 위치를 반환한 마지막 메시지까지 갱신 */
    public function list(User $user, string $code, int $sinceId, bool $read): array
    {
        [$room, $me] = $this->member($user, $code);
        $this->assertReadable($room);
        $page = (int) $this->cfg('page_size', 50);
        $q = DB::table('room_messages')->where('room_id', $room->id)->whereNull('deleted_at')
            ->where('created_at', '>=', $me->created_at)
            ->where(fn ($w) => $w->whereNull('hidden_from_side')->orWhere('hidden_from_side', '!=', $me->side));
        if ($sinceId > 0) {
            $rows = (clone $q)->where('id', '>', $sinceId)->orderBy('id')->limit($page + 1)->get();
            $more = $rows->count() > $page;
            $rows = $rows->take($page)->values();
        } else {
            $rows = (clone $q)->orderByDesc('id')->limit($page)->get()->reverse()->values();
            $more = false;
        }
        $latest = (int) ((clone $q)->max('id') ?? 0);
        if ($read) {
            $upto = $more ? (int) $rows->last()->id : $latest;
            if ($upto > (int) $me->chat_last_seen_id) {
                DB::table('room_players')->where('id', $me->id)->update(['chat_last_seen_id' => $upto]);
                $me->chat_last_seen_id = $upto;
            }
        }
        $names = [];
        foreach ($rows->pluck('user_id')->unique() as $uid) {
            $u = User::find($uid);
            $names[$uid] = $u ? $this->name($u) : '';
        }
        [$ok, $reason] = $this->sendState($user, $room, $me);

        return [
            'messages' => $rows->map(fn ($m) => $this->view($m, $me, $names[$m->user_id] ?? ''))->all(),
            'latest_id' => $latest,
            'has_more' => $more,
            'unread' => (int) (clone $q)->where('side', '!=', $me->side)->where('id', '>', $me->chat_last_seen_id)->count(),
            'can_send' => $ok,
            'cannot_send_reason' => $reason,
            'muted' => (bool) $me->chat_muted,
            'read_only' => ! $this->isOpen($room), 'restricted_until' => $this->restrictedUntil($user),
        ];
    }

    /** 내 채팅 제재 해제 시각(ISO8601). 제재 중이 아니면 null. 본인에게만 노출 */
    private function restrictedUntil(User $user): ?string
    {
        return $user->chat_restricted_until && Carbon::parse($user->chat_restricted_until)->isFuture()
            ? Carbon::parse($user->chat_restricted_until)->toIso8601String() : null;
    }

    private function view(object $m, object $me, string $name): array
    {
        return [
            'id' => (int) $m->id, 'side' => $m->side, 'name' => $this->esc($name), 'mine' => $m->side === $me->side,
            'kind' => $m->kind, 'quick_id' => $m->quick_id, 'body' => $m->body_raw ? $this->esc($m->body) : $m->body, 'created_at' => Carbon::parse($m->created_at)->toIso8601String(),
        ];
    }

    private function esc(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    }

    /** 저장된 행의 원문(이스케이프된 기존 행은 복원) */
    private function plainBody(object $m): string
    {
        return $m->body_raw ? (string) $m->body : htmlspecialchars_decode((string) $m->body, ENT_QUOTES);
    }

    /** 제어문자 제거·공백 정규화(HTML 이스케이프 전의 순수 텍스트) */
    public function normalize(string $s): string
    {
        $s = preg_replace('/[\p{Cc}\p{Cf}\x{2028}\x{2029}]+/u', ' ', $s) ?? '';
        $s = preg_replace('/\s+/u', ' ', $s) ?? '';

        return trim($s);
    }

    /** 금칙어 판정용 정규화: NFKC, 결합문자·한글 채움문자·점자 공백·제로폭 제거, 소문자 */
    private function foldForBan(string $s): string
    {
        if (class_exists(\Normalizer::class)) {
            $s = \Normalizer::normalize($s, \Normalizer::FORM_KC) ?: $s;
        }
        $s = preg_replace('/[\p{M}\x{3164}\x{115F}\x{1160}\x{2800}\x{200B}-\x{200F}\x{2060}\x{FEFF}]+/u', '', $s) ?? '';

        return mb_strtolower($s);
    }

    /**
     * 2단 매칭(오탐 "다시 발견"->"시발" 방지):
     * 1) 단어(공백/기호로 나눈 토큰) 안에 금칙어가 포함(붙여쓴 "시발놈" 등).
     * 2) 한 글자짜리 토큰이 연속한 구간("시 발", "시.발")을 이어 붙여 포함 여부 확인.
     * 한계: "시.발놈"처럼 긴 토큰과 한 글자 조각이 섞인 우회는 못 잡는다(오탐 대신 미탐 감수).
     */
    private function hasBannedWord(string $text): bool
    {
        $tokens = preg_split('/[^\p{L}\p{N}]+/u', $this->foldForBan($text), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $runs = [];
        $cur = '';
        foreach ($tokens as $t) {
            if (mb_strlen($t) === 1) {
                $cur .= $t;
            } else {
                if ($cur !== '') {
                    $runs[] = $cur;
                }
                $cur = '';
            }
        }
        if ($cur !== '') {
            $runs[] = $cur;
        }
        $targets = array_merge($tokens, $runs);
        foreach ((array) $this->cfg('banned_words', []) as $w) {
            $w = $this->foldForBan((string) $w);
            if ($w === '') {
                continue;
            }
            foreach ($targets as $t) {
                if (mb_strpos($t, $w) !== false) {
                    return true;
                }
            }
        }

        return false;
    }

    /** POST messages {kind:text|quick, text?|quick_id?} */
    public function send(User $user, string $code, string $kind, ?string $text, ?string $quickId): array
    {
        // 같은 유저의 동시 전송(쓰로틀·중복 검사 경합)을 직렬화
        $lock = Cache::lock('chat:send:'.$user->id, 10);
        try {
            $lock->block(3);
        } catch (LockTimeoutException) {
            throw new IllegalAction('chat_throttled', '메시지를 너무 빠르게 보내고 있습니다.', 429, ['retry_after' => 1]);
        }
        try {
            return $this->doSend($user, $code, $kind, $text, $quickId);
        } finally {
            $lock->release();
        }
    }

    private function doSend(User $user, string $code, string $kind, ?string $text, ?string $quickId): array
    {
        return DB::transaction(function () use ($user, $code, $kind, $text, $quickId) {
            [$room, $me] = $this->member($user, $code);
            [$ok, $reason] = $this->sendState($user, $room, $me);
            if (! $ok) {
                $extra = $reason === 'chat_restricted' ? ['until' => Carbon::parse($user->chat_restricted_until)->toIso8601String()] : [];
                throw new IllegalAction($reason, '지금은 채팅을 보낼 수 없습니다.', $reason === 'chat_restricted' ? 403 : 409, $extra);
            }

            if ($kind === 'quick') {
                $presets = (array) $this->cfg('quick_presets', []);
                if ($quickId === null || ! isset($presets[$quickId])) {
                    throw new IllegalAction('invalid_quick_id', '없는 빠른 채팅입니다.', 422);
                }
                $body = (string) $presets[$quickId];
            } else {
                if ($user->is_guest && ! $this->cfg('guest_free_text', false)) {
                    throw new IllegalAction('guest_text_forbidden', '게스트는 빠른 채팅만 쓸 수 있습니다.', 403);
                }
                $plain = $this->normalize((string) $text);
                if ($plain === '') {
                    throw new IllegalAction('empty_message', '내용이 비어 있습니다.', 422);
                }
                if (mb_strlen($plain) > (int) $this->cfg('max_length', 100)) {
                    throw new IllegalAction('message_too_long', '메시지가 너무 깁니다.', 422);
                }
                if ($this->hasBannedWord($plain)) {
                    throw new IllegalAction('banned_word', '사용할 수 없는 표현이 포함되어 있습니다.', 422);
                }
                $body = $plain;
            }

            $last = DB::table('room_messages')->where('user_id', $user->id)->orderByDesc('id')->first();
            if ($last) {
                $age = Carbon::parse($last->created_at)->diffInSeconds(now(), false);
                $interval = (int) $this->cfg('send_interval_seconds', 3);
                if ($age < $interval) {
                    throw new IllegalAction('chat_throttled', '메시지를 너무 빠르게 보내고 있습니다.', 429, ['retry_after' => max(1, (int) ceil($interval - $age))]);
                }
                if ((int) $last->room_id === (int) $room->id && $this->plainBody($last) === $body && $age < (int) $this->cfg('duplicate_window_seconds', 30)) {
                    throw new IllegalAction('chat_duplicate', '같은 메시지를 연속으로 보낼 수 없습니다.', 422);
                }
            }

            $other = DB::table('room_players')->where('room_id', $room->id)->where('id', '!=', $me->id)->first();
            $id = DB::table('room_messages')->insertGetId([
                'room_id' => $room->id, 'user_id' => $user->id, 'side' => $me->side, 'kind' => $kind === 'quick' ? 'quick' : 'text',
                'quick_id' => $kind === 'quick' ? $quickId : null, 'body' => $body, 'body_raw' => true,
                'hidden_from_side' => $other && $other->chat_muted ? $other->side : null, 'created_at' => now(),
            ]);
            $this->prune((int) $room->id);
            \App\Support\RoomRealtime::chat($code, (int) $id);   // 웹소켓 ping(커밋 후): 수신 측이 messages?after_id 재조회

            return ['message' => $this->view(DB::table('room_messages')->where('id', $id)->first(), $me, $this->name($user))];
        });
    }

    /** 보관 기간·방당 최대 개수 초과분 삭제(해당 방만, 전송 시점에 지연 평가) */
    private function prune(int $roomId): void
    {
        DB::table('room_messages')->where('room_id', $roomId)->where('created_at', '<', now()->subDays((int) $this->cfg('retention_days', 7)))
            ->whereNotIn('id', DB::table('chat_reports')->whereNotNull('message_id')->select('message_id'))->delete();
        $max = (int) $this->cfg('max_per_room', 200);
        $cut = DB::table('room_messages')->where('room_id', $roomId)->orderByDesc('id')->skip($max)->value('id');
        if ($cut) {
            DB::table('room_messages')->where('room_id', $roomId)->where('id', '<=', $cut)
                ->whereNotIn('id', DB::table('chat_reports')->whereNotNull('message_id')->select('message_id'))->delete();
        }
    }

    /** POST messages/{id}/report: 상대 메시지만. 멱등. 최근 기간에 서로 다른 신고자 N명 누적 시 대상 채팅 제한 */
    public function report(User $user, string $code, int $messageId, string $reason): array
    {
        return DB::transaction(function () use ($user, $code, $messageId, $reason) {
            [$room, $me] = $this->member($user, $code);
            $this->assertReadable($room);
            $m = DB::table('room_messages')->where('id', $messageId)->where('room_id', $room->id)->whereNull('deleted_at')->first();
            if (! $m || $m->hidden_from_side === $me->side) {
                throw new IllegalAction('message_not_found', '메시지를 찾을 수 없습니다.', 404);
            }
            if ((int) $m->user_id === (int) $user->id) {
                throw new IllegalAction('cannot_report_self', '내 메시지는 신고할 수 없습니다.', 422);
            }
            $new = DB::table('chat_reports')->insertOrIgnore([
                'reporter_user_id' => $user->id, 'message_id' => $m->id, 'target_user_id' => $m->user_id, 'reason' => $reason, 'created_at' => now(),
                'body' => $this->plainBody($m), 'counts' => ! $user->is_guest && $m->kind !== 'quick',
            ]) > 0;
            if ($new) {
                // 제재 카운트: 게스트 신고자·quick 메시지 신고 제외, 마지막 제재 이후 + 기간 내 서로 다른 신고자
                $target = DB::table('users')->where('id', $m->user_id)->first();
                $since = now()->subDays((int) $this->cfg('report_window_days', 7));
                if ($target && $target->chat_sanctioned_at && Carbon::parse($target->chat_sanctioned_at)->gt($since)) {
                    $since = Carbon::parse($target->chat_sanctioned_at);
                }
                $n = DB::table('chat_reports')->where('target_user_id', $m->user_id)->where('counts', true)
                    ->where('created_at', '>', $since)->distinct()->count('reporter_user_id');
                if ($n >= (int) $this->cfg('report_threshold', 3)) {
                    DB::table('users')->where('id', $m->user_id)->update([
                        'chat_restricted_until' => now()->addMinutes((int) $this->cfg('restrict_minutes', 60)), 'chat_sanctioned_at' => now(),
                    ]);
                }
            }

            return ['ok' => true, 'already_reported' => ! $new];
        });
    }

    public function settings(User $user, string $code, ?bool $muted = null): array
    {
        [$room, $me] = $this->member($user, $code);
        if ($muted !== null) {
            DB::table('room_players')->where('id', $me->id)->update(['chat_muted' => $muted, 'updated_at' => now()]);
            $me->chat_muted = $muted;
        }
        [$ok, $reason] = $this->sendState($user, $room, $me);

        return [
            'muted' => (bool) $me->chat_muted, 'can_send' => $ok, 'cannot_send_reason' => $reason, 'restricted_until' => $this->restrictedUntil($user),
            'is_guest' => (bool) $user->is_guest, 'free_text' => ! $user->is_guest || (bool) $this->cfg('guest_free_text', false),
            'max_length' => (int) $this->cfg('max_length', 100), 'send_interval_seconds' => (int) $this->cfg('send_interval_seconds', 3),
            'report_reasons' => array_values((array) $this->cfg('report_reasons', [])), 'quick_presets' => $this->presets(),
        ];
    }
}
