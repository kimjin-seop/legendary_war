<?php

namespace App\Http\Controllers;

use App\Services\GachaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 가챠 API (회원/게스트 공통, game.actor + throttle:game). config game.gacha.enabled off면 404 gacha_disabled. */
class GachaController extends Controller
{
    public function __construct(private readonly GachaService $gacha)
    {
    }

    public function show(Request $request): JsonResponse
    {
        $this->gacha->assertEnabled();

        return response()->json($this->gacha->info($request->user()->id));
    }

    public function pull(Request $request): JsonResponse
    {
        $this->gacha->assertEnabled();
        $data = $request->validate([
            'count' => ['required', 'integer', 'in:1,10'],
            'request_id' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/'],
            'banner' => ['nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/'],   // 시나리오 배너 key. 생략/normal = 서고(전체 풀)
        ]);

        return response()->json($this->gacha->pull($request->user()->id, (int) $data['count'], $data['request_id'], $data['banner'] ?? null));
    }
}
