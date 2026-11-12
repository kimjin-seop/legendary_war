<?php

namespace App\Http\Controllers;

use App\Services\ItemShopService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 전투 소모품 상점·보유 API (game.actor + throttle:game). 끄기: database/data/battle_items.json enabled=false -> 404 items_disabled */
class ItemController extends Controller
{
    public function __construct(private readonly ItemShopService $items)
    {
    }

    public function shop(Request $request): JsonResponse
    {
        return response()->json($this->items->list($request->user()->id));
    }

    public function owned(Request $request): JsonResponse
    {
        return response()->json($this->items->owned($request->user()->id));
    }

    public function buy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:40'],
            'qty' => ['sometimes', 'integer', 'min:1', 'max:99'],
            'request_id' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/'],
        ]);

        return response()->json($this->items->buy($request->user()->id, $data['code'], (int) ($data['qty'] ?? 1), $data['request_id']));
    }
}
