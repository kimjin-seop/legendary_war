<?php

namespace App\Http\Controllers;

use App\Services\TutorialService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TutorialController extends Controller
{
    public function __construct(private readonly TutorialService $tutorial)
    {
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json(['tutorial' => $this->tutorial->state($request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        $d = $request->validate(['step' => ['required', 'integer', 'min:0', 'max:1000'], 'skipped' => ['sometimes', 'boolean'], 'done' => ['sometimes', 'boolean']]);
        $r = $this->tutorial->update($request->user(), (int) $d['step'], (bool) ($d['skipped'] ?? false), (bool) ($d['done'] ?? false));

        return response()->json(['tutorial' => $r['state'], 'granted' => $r['granted']]);
    }
}
