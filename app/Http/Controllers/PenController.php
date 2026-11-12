<?php

namespace App\Http\Controllers;

use App\Services\PenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 펜(영구 재화) 조회: GET /api/pen. 명세 docs/SEASON_PEN_DESIGN.md */
class PenController extends Controller
{
    public function show(Request $request, PenService $pen): JsonResponse
    {
        return response()->json($pen->summary($request->user()->id));
    }
}
