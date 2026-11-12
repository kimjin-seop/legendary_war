<?php

namespace App\Http\Controllers;

use App\Services\PvpRecordService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** GET /api/me/record: 내 PvP 전적. 명세 docs/PVP_RECORD_SPEC.md */
class RecordController extends Controller
{
    public function __construct(private readonly PvpRecordService $records)
    {
    }

    public function show(Request $request): JsonResponse
    {
        $d = $request->validate(['page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:50']]);

        return response()->json($this->records->show($request->user(), (int) ($d['page'] ?? 1), (int) ($d['per_page'] ?? 20)));
    }
}
