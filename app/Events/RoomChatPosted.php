<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/** 방 채팅 새 메시지 알림(payload 는 메시지 id 뿐, 본문은 GET /api/rooms/{code}/messages?after_id= 재조회: 차단·뮤트 필터 유지). */
class RoomChatPosted implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(public string $code, public int $id) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('room.'.$this->code.'.chat')];
    }

    public function broadcastAs(): string
    {
        return 'chat.message';
    }

    public function broadcastWith(): array
    {
        return ['id' => $this->id];
    }
}
