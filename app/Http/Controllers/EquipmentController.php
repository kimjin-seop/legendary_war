<?php

namespace App\Http\Controllers;

use App\Services\EquipmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 장비·상점 API (game.actor + throttle:game). config game.equipment.enabled off/테이블 없음이면 404 equipment_disabled. */
class EquipmentController extends Controller
{
    public function __construct(private readonly EquipmentService $equipment)
    {
    }

    public function shop(Request $request): JsonResponse
    {
        return response()->json($this->equipment->shop($request->user()->id));
    }

    public function buy(Request $request): JsonResponse
    {
        $this->equipment->assertAvailable();
        $data = $request->validate([
            'code' => ['required', 'string', 'max:40'],
            'request_id' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/'],
        ]);

        return response()->json($this->equipment->buy($request->user()->id, $data['code'], $data['request_id']));
    }

    public function inventory(Request $request): JsonResponse
    {
        return response()->json($this->equipment->inventory($request->user()->id));
    }

    public function equip(Request $request, int $userHeroId): JsonResponse
    {
        $this->equipment->assertAvailable();
        $data = $request->validate([
            'equipment' => ['required', 'array', 'max:5'],
            'equipment.*' => ['nullable', 'integer', 'min:1'],
        ]);

        return response()->json($this->equipment->equip($request->user()->id, $userHeroId, $data['equipment']));
    }
}
