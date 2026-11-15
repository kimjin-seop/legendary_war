<?php

use App\Models\User;
use App\Support\RoomRealtime;
use Illuminate\Support\Facades\Broadcast;

/*
| 웹소켓 채널(Reverb). 푸시는 ping(seq/id)뿐이며 상세는 기존 HTTP 로 재조회한다.
| 인증: POST /api/broadcasting/auth (game.actor: 회원 세션 쿠키 또는 X-Guest-Token). 방 참가자만 허용.
*/
Broadcast::channel('room.{code}', fn (User $user, string $code) => RoomRealtime::isMember($user, $code));
Broadcast::channel('room.{code}.chat', fn (User $user, string $code) => RoomRealtime::isMember($user, $code));
