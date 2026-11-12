<?php

namespace App\Http\Controllers;

use App\Services\ExchangeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 일일 교환소 API (game.actor + throttle:game). 명세: routes/api.php 주석 / docs/SHOP_EXCHANGE_SPEC.md */
class ExchangeController extends Controller
{
    public function __construct(private readonly ExchangeService $exchange)
    {
    }

    public function list(Request $request): JsonResponse
    {
        return response()->json($this->exchange->list($request->user()->id));
    }

    public function buy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:40'],
            'request_id' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/'],
        ]);

        return response()->json($this->exchange->buy($request->user()->id, $data['code'], $data['request_id']));
    }
}
