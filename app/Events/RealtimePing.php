<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * 웹소켓 2단계 공용 ping(최소 payload). 상세는 수신 측이 기존 HTTP 로 재조회한다(권한·마스킹 불변).
 *  - rank.matched {match_id}   private user.{id}        (랭크 매칭 성사, 양쪽 유저)
 *  - war.changed {seq}         private war.{seasonId}   (전황 이벤트 발생, 시즌 가입자)
 *  - lobby.changed {}          private lobby            (공개 방 목록 변화)
 *  - chat.removed {id}         private room.{code}.chat (메시지 삭제 id, 제재 등 상태 갱신은 id=0)
 */
class RealtimePing implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(public string $channel, public string $name, public array $data = []) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel($this->channel)];
    }

    public function broadcastAs(): string
    {
        return $this->name;
    }

    public function broadcastWith(): array
    {
        return $this->data;
    }
}
