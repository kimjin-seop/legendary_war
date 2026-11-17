<?php

namespace App\Support;

use App\Events\RoomChanged;
use App\Events\RealtimePing;
use App\Events\RoomChatPosted;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * 방/채팅 웹소켓(Reverb) 푸시 진입점. BROADCAST_CONNECTION=reverb 일 때만 동작하고 그 외(log/null)는 완전 무동작.
 * 트랜잭션 커밋 후(DB::afterCommit)에 보내며, 전송 실패는 삼켜서 report 만 한다(게임 처리에 영향 없음).
 * 클라이언트는 폴링을 유지하므로 푸시가 유실돼도 상태는 폴링으로 복구된다.
 */
final class RoomRealtime
{
    public static function enabled(): bool
    {
        return config('broadcasting.default') === 'reverb';
    }

    /** 방 상태 변경 ping(payload: 최신 전투 이벤트 seq) */
    public static function room(string $code): void
    {
        if (! self::enabled()) {
            return;
        }
        $code = strtoupper($code);
        DB::afterCommit(function () use ($code) {
            try {
                $row = DB::table('rooms')->leftJoin('battles', 'battles.id', '=', 'rooms.battle_id')->where('rooms.code', $code)->first(['rooms.mode', 'battles.last_event_seq']);
                if ($row && $row->mode === 'pvp') {   // solo 방은 상대가 없어 푸시 불필요
                    broadcast(new RoomChanged($code, (int) $row->last_event_seq));
                }
            } catch (\Throwable $e) {
                report($e);
            }
        });
    }

    /** 방 채팅 새 메시지 ping(payload: 메시지 id) */
    public static function chat(string $code, int $messageId): void
    {
        if (! self::enabled()) {
            return;
        }
        $code = strtoupper($code);
        DB::afterCommit(function () use ($code, $messageId) {
            try {
                broadcast(new RoomChatPosted($code, $messageId));
            } catch (\Throwable $e) {
                report($e);
            }
        });
    }

    /** 2단계 공용 ping 발행(커밋 후, 실패 삼킴). $coalesceSeconds > 0 이면 같은 키는 그 시간 동안 1건으로 합친다(유실은 폴링 안전망이 복구) */
    private static function ping(string $channel, string $name, array $data = [], int $coalesceSeconds = 0): void
    {
        if (! self::enabled()) {
            return;
        }
        DB::afterCommit(function () use ($channel, $name, $data, $coalesceSeconds) {
            try {
                if ($coalesceSeconds > 0 && ! Cache::add("rt:$channel:$name", 1, $coalesceSeconds)) {
                    return;
                }
                broadcast(new RealtimePing($channel, $name, $data));
            } catch (\Throwable $e) {
                report($e);
            }
        });
    }

    /** 랭크 매칭 성사: 두 유저의 user.{id} 채널 */
    public static function rankMatched(int $userId, int $matchId): void
    {
        self::ping("user.$userId", 'rank.matched', ['match_id' => $matchId]);
    }

    /** 시즌 전쟁 전황 변화(시즌당 3초 합치기: 전황 배치가 이벤트를 한꺼번에 만들 수 있음) */
    public static function war(int $seasonId, int $seq = 0): void
    {
        self::ping("war.$seasonId", 'war.changed', ['seq' => $seq], 3);
    }

    /** 로비 공개 방 목록 변화(1초 합치기) */
    public static function lobby(): void
    {
        self::ping('lobby', 'lobby.changed', [], 1);
    }

    /** 채팅 메시지 삭제(id>0) 또는 제재 등 채팅 상태 변화(id=0 -> 클라이언트가 설정·목록 재조회) */
    public static function chatRemoved(string $code, int $messageId): void
    {
        self::ping('room.'.strtoupper($code).'.chat', 'chat.removed', ['id' => $messageId]);
    }

    /** 채널 인증: 본인 user.{id} 만 */
    public static function isSelf(User $user, int|string $id): bool
    {
        return (int) $user->id === (int) $id;
    }

    /** 채널 인증: 시즌 가입자만 */
    public static function isSeasonMember(User $user, int|string $seasonId): bool
    {
        return DB::table('season_members')->where(['season_id' => (int) $seasonId, 'user_id' => $user->id])->exists();
    }

    /** 채널 인증: 해당 방 참가자만(방 존재·참가 여부 DB 조회) */
    public static function isMember(User $user, string $code): bool
    {
        return DB::table('rooms')->join('room_players', 'room_players.room_id', '=', 'rooms.id')
            ->where('rooms.code', strtoupper($code))->where('room_players.user_id', $user->id)->exists();
    }
}
