<?php

namespace App\Http\Controllers;

use App\Game\IllegalAction;
use App\Services\RankService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 멀티 랭크/대기열. game.rank.enabled=false(기본)면 전부 404 rank_disabled. 명세: docs/RANK_QUEUE_SPEC.md */
class RankController extends Controller
{
    public function __construct(private readonly RankService $rank)
    {
    }

    private function guard(): void
    {
        $this->rank->enabled() || throw new IllegalAction('rank_disabled', '랭크 대전을 사용할 수 없습니다.', 404);
    }

    public function me(Request $r): JsonResponse
    {
        $this->guard();

        return response()->json($this->rank->me($r->user()));
    }

    public function ranking(Request $r): JsonResponse
    {
        $this->guard();

        return response()->json($this->rank->ranking($r->user()));
    }

    public function enqueue(Request $r): JsonResponse
    {
        $this->guard();

        return response()->json($this->rank->enqueue($r->user()));
    }

    public function cancel(Request $r): JsonResponse
    {
        $this->guard();

        return response()->json($this->rank->cancel($r->user()));
    }

    public function match(Request $r, int $id): JsonResponse
    {
        $this->guard();

        return response()->json($this->rank->matchResult($r->user(), $id));
    }

    public function status(Request $r): JsonResponse
    {
        $this->guard();

        return response()->json($this->rank->status($r->user()));
    }
}
