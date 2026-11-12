<?php

namespace App\Http\Controllers;

use App\Services\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 방 채팅 API(pvp 참가자 전용, 폴링). 규칙은 ChatService. 응답 스키마는 docs/HANDOFF.md 방 채팅 절. */
class ChatController extends Controller
{
    public function __construct(private readonly ChatService $chat)
    {
    }

    /** GET ?since_id=N&read=0|1 */
    public function index(Request $request, string $code): JsonResponse
    {
        $d = $request->validate(['since_id' => ['sometimes', 'integer', 'min:0'], 'read' => ['sometimes', 'boolean']]);

        return response()->json($this->chat->list($request->user(), $code, (int) ($d['since_id'] ?? 0), (bool) ($d['read'] ?? false)));
    }

    /** POST {kind:text, text} | {kind:quick, quick_id} */
    public function store(Request $request, string $code): JsonResponse
    {
        $d = $request->validate([
            'kind' => ['required', 'in:text,quick'], 'text' => ['required_if:kind,text', 'nullable', 'string', 'max:2000'],
            'quick_id' => ['required_if:kind,quick', 'nullable', 'string', 'max:24'],
        ]);

        return response()->json($this->chat->send($request->user(), $code, $d['kind'], $d['text'] ?? null, $d['quick_id'] ?? null), 201);
    }

    public function report(Request $request, string $code, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => ['required', 'string', 'in:'.implode(',', config('chat.report_reasons'))]]);

        return response()->json($this->chat->report($request->user(), $code, $id, $d['reason']));
    }

    public function settings(Request $request, string $code): JsonResponse
    {
        return response()->json($this->chat->settings($request->user(), $code));
    }

    public function updateSettings(Request $request, string $code): JsonResponse
    {
        $d = $request->validate(['muted' => ['required', 'boolean']]);

        return response()->json($this->chat->settings($request->user(), $code, (bool) $d['muted']));
    }
}
