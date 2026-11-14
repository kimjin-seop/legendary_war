<?php

namespace App\Http\Controllers;

use App\Services\HeroStarService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 영웅 별 강화 API (game.actor + throttle:game). 테이블 없음/config off 면 404 star_disabled. */
class HeroStarController extends Controller
{
    public function __construct(private readonly HeroStarService $star)
    {
    }

    public function starUp(Request $request, int $userHeroId): JsonResponse
    {
        $this->star->assertEnabled();
        $data = $request->validate(['request_id' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/']]);

        return response()->json($this->star->starUp($request->user()->id, $userHeroId, $data['request_id']));
    }
}
