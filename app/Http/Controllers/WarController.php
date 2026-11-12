<?php

namespace App\Http\Controllers;

use App\Services\WarService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 시즌 전쟁 API (game.actor + throttle:game). 전투 진행은 기존 /api/battles/{id}/* 를 그대로 쓴다. */
class WarController extends Controller
{
    public function __construct(private readonly WarService $war, private readonly \App\Services\WarReportService $report)
    {
    }

    /** 시즌 시나리오 선택(?scenario= 또는 body scenario). 없으면 가입한 시즌 > 최신 활성 시즌. 형식 오류는 무시(null) */
    private function scenario(Request $request): ?string
    {
        $v = $request->input('scenario');

        return is_string($v) && preg_match('/^[a-z0-9_]{1,32}$/', $v) === 1 ? $v : null;
    }

    /** 진행 중인 시즌 목록(시나리오 선택 UI) */
    public function seasons(Request $request): JsonResponse
    {
        return response()->json(['seasons' => $this->war->activeSeasons($request->user())]);
    }

    public function active(Request $request): JsonResponse
    {
        return response()->json($this->war->active($request->user(), $this->scenario($request)));
    }

    public function state(Request $request): JsonResponse
    {
        return response()->json($this->war->state($request->user(), $this->scenario($request)));
    }

    public function join(Request $request): JsonResponse
    {
        $data = $request->validate(['country' => ['required', 'string', 'max:32'], 'scenario' => ['nullable', 'string', 'regex:/^[a-z0-9_]{1,32}$/']]);

        return response()->json($this->war->join($request->user(), $data['country'], $data['scenario'] ?? null));
    }

    public function preview(Request $request): JsonResponse
    {
        $data = $request->validate(['scenario' => ['nullable', 'string', 'max:32']]);

        return response()->json($this->war->preview($data['scenario'] ?? 'imjin'));
    }

    public function map(Request $request): JsonResponse
    {
        return response()->json($this->war->map($request->user(), $this->scenario($request)));
    }

    public function attack(Request $request, string $code): JsonResponse
    {
        return response()->json($this->war->attack($request->user(), $code, $this->scenario($request)), 201);
    }

    public function ranking(Request $request): JsonResponse
    {
        return response()->json($this->report->ranking($request->user(), $this->scenario($request)));
    }

    public function events(Request $request): JsonResponse
    {
        $d = $request->validate(['after_id' => ['sometimes', 'integer', 'min:0'], 'limit' => ['sometimes', 'integer', 'min:1', 'max:100']]);

        return response()->json($this->report->events((int) ($d['after_id'] ?? 0), (int) ($d['limit'] ?? config('war.list_limit')), $this->scenario($request), $request->user()));
    }

    public function unread(Request $request): JsonResponse
    {
        $d = $request->validate(['after_id' => ['sometimes', 'integer', 'min:0']]);

        return response()->json($this->report->unread($request->user(), (int) ($d['after_id'] ?? 0), $this->scenario($request)));
    }

    public function myBattles(Request $request): JsonResponse
    {
        $d = $request->validate(['limit' => ['sometimes', 'integer', 'min:1', 'max:50']]);

        return response()->json($this->report->myBattles($request->user(), (int) ($d['limit'] ?? 10), $this->scenario($request)));
    }

    public function history(Request $request): JsonResponse
    {
        return response()->json($this->report->history($request->user()));
    }
}
