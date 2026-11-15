<?php

namespace App\Support;

use App\Events\RoomChanged;
use App\Events\RoomChatPosted;
use App\Models\User;
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

    /** 채널 인증: 해당 방 참가자만(방 존재·참가 여부 DB 조회) */
    public static function isMember(User $user, string $code): bool
    {
        return DB::table('rooms')->join('room_players', 'room_players.room_id', '=', 'rooms.id')
            ->where('rooms.code', strtoupper($code))->where('room_players.user_id', $user->id)->exists();
    }
}
