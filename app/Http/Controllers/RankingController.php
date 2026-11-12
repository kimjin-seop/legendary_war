<?php

namespace App\Http\Controllers;

use App\Game\IllegalAction;
use App\Services\RankingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RankingController extends Controller
{
    public function __construct(private readonly RankingService $ranking)
    {
    }

    public function show(Request $request): JsonResponse
    {
        if (! $this->ranking->enabled()) {
            throw new IllegalAction('ranking_disabled', '랭킹 보드를 사용할 수 없습니다.', 404);
        }

        return response()->json($this->ranking->board((string) $request->query('board', 'level'), $request->user()));
    }
}
