<?php

namespace App\Http\Controllers;

use App\Services\SweepService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 소탕 API: POST /api/stages/{stage}/sweep {count 1~max, request_id}. 자동 전투 아님(수동 3성 클리어 보상 재수령). */
class SweepController extends Controller
{
    public function __construct(private readonly SweepService $sweeps)
    {
    }

    public function sweep(Request $request, int $stage): JsonResponse
    {
        $d = $request->validate(['count' => ['required', 'integer', 'min:1', 'max:'.max(1, (int) config('game.sweep.max_count', 10))], 'request_id' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/']]);

        return response()->json($this->sweeps->sweep($request->user(), $stage, (int) $d['count'], $d['request_id']));
    }
}
