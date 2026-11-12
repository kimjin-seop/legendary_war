<?php

namespace App\Http\Controllers;

use App\Services\QuestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QuestController extends Controller
{
    public function __construct(private readonly QuestService $quests)
    {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->quests->list($request->user()));
    }

    public function claim(Request $request, string $code): JsonResponse
    {
        return response()->json($this->quests->claim($request->user(), $code));
    }
}
