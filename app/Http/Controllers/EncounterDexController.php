<?php

namespace App\Http\Controllers;

use App\Services\EncounterDexService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** GET /api/dex/encounter: 도감 '조우 장수'(서가 NPC) 열람 전용 목록. 로그인(게스트 포함) 필요, config game.encounter_dex.enabled 로 끈다. */
class EncounterDexController extends Controller
{
    public function __construct(private readonly EncounterDexService $dex)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $this->dex->assertEnabled();

        return response()->json($this->dex->list((int) $request->user()->id));
    }
}
