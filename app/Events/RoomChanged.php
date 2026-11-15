<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * 방/PvP 변경 알림(payload 는 마지막 전투 이벤트 seq 하나뿐). 수신 측은 GET /api/rooms/{code}?after_seq= 로 재조회한다
 * (참가자 권한·상대 MP 마스킹은 기존 HTTP 응답이 그대로 적용). PvP 는 지연이 없어야 하므로 요청 커밋 직후 즉시 전송한다.
 */
class RoomChanged implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(public string $code, public int $seq) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('room.'.$this->code)];
    }

    public function broadcastAs(): string
    {
        return 'room.changed';
    }

    public function broadcastWith(): array
    {
        return ['seq' => $this->seq];
    }
}
