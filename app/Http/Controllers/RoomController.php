<?php

namespace App\Http\Controllers;

use App\Services\MapCatalog;
use App\Services\RoomService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** 방(룸) API: 참가자만 접근(비참가자 404). 상세 규칙은 RoomService. */
class RoomController extends Controller
{
    public function __construct(private readonly RoomService $rooms)
    {
    }

    private function state(Request $r, string $code, int $after = 0): JsonResponse
    {
        return response()->json($this->rooms->poll($r->user(), $code, $after));
    }

    public function index(): JsonResponse
    {
        return response()->json(['rooms' => $this->rooms->listPublic()]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(['mode' => ['required', 'in:solo,pvp'], 'visibility' => ['sometimes', 'in:public,private'], 'map_code' => ['sometimes', 'nullable', 'string', 'max:32'], 'follow_troops' => ['sometimes', 'boolean']]);
        $room = $this->rooms->create($request->user(), $d['mode'], $d['visibility'] ?? 'private', $d['map_code'] ?? null, (bool) ($d['follow_troops'] ?? false));

        return $this->state($request, $room->code)->setStatusCode(201);
    }

    /** 전장 프리셋 목록: mode=solo|pvp(기본 solo), per_side, biome, size_class, include_tiles=1 */
    public function maps(Request $request, MapCatalog $catalog): JsonResponse
    {
        $d = $request->validate([
            'mode' => ['sometimes', 'in:solo,pvp'], 'per_side' => ['sometimes', 'integer', 'min:1', 'max:12'], 'biome' => ['sometimes', 'string', 'max:16'],
            'size_class' => ['sometimes', 'in:S,M,L'], 'include_tiles' => ['sometimes', 'boolean'],
        ]);

        return response()->json($catalog->list($d['mode'] ?? 'solo', isset($d['per_side']) ? (int) $d['per_side'] : null, $d['biome'] ?? null, $d['size_class'] ?? null, (bool) ($d['include_tiles'] ?? false)));
    }

    /** 미리보기(타일 격자, 60초 캐시) */
    public function mapPreview(string $code, MapCatalog $catalog): JsonResponse
    {
        $p = $catalog->preview($code);
        $p === null && abort(404, 'map_not_found');

        return response()->json($p);
    }

    public function join(Request $request): JsonResponse
    {
        $d = $request->validate(['code' => ['required', 'string', 'size:8', 'alpha_num']]);
        $room = $this->rooms->join($request->user(), $d['code']);

        return $this->state($request, $room->code);
    }

    public function show(Request $request, string $code): JsonResponse
    {
        return $this->state($request, $code, max(0, (int) $request->query('after_seq', 0)));
    }

    public function leave(Request $request, string $code): JsonResponse
    {
        $this->rooms->leave($request->user(), $code);

        return response()->json(['ok' => true]);
    }

    public function ready(Request $request, string $code): JsonResponse
    {
        $d = $request->validate(['ready' => ['required', 'boolean']]);
        $this->rooms->setReady($request->user(), $code, (bool) $d['ready']);

        return $this->state($request, $code);
    }

    public function start(Request $request, string $code): JsonResponse
    {
        $this->rooms->start($request->user(), $code);

        return $this->state($request, $code);
    }

    public function deployment(Request $request, string $code): JsonResponse
    {
        return response()->json($this->rooms->deployment($request->user(), $code));
    }

    public function submitDeployment(Request $request, string $code): JsonResponse
    {
        $d = $request->validate([
            'placements' => ['required', 'array', 'min:1', 'max:10'], 'placements.*.user_hero_id' => ['required', 'integer'],
            'placements.*.x' => ['required', 'integer'], 'placements.*.y' => ['required', 'integer'],
            'placements.*.troops' => ['sometimes', 'array', 'max:4'], 'placements.*.troops.*.class' => ['required', 'string', 'max:16'],
            'placements.*.troops.*.x' => ['required', 'integer'], 'placements.*.troops.*.y' => ['required', 'integer'],
        ]);
        $this->rooms->submitDeployment($request->user(), $code, array_values($d['placements']));

        return response()->json($this->rooms->deployment($request->user(), $code));
    }

    public function confirm(Request $request, string $code): JsonResponse
    {
        $this->rooms->confirm($request->user(), $code);

        return $this->state($request, $code);
    }

    /** body: {type: move|attack|wait|end_turn|activate|end_activation, squad_id, unit_id, x, y, target_id, after_seq?} -> 내 행동 결과 이벤트 + 최신 방 상태 */
    public function action(Request $request, string $code): JsonResponse
    {
        $d = $request->validate([
            'type' => ['required', 'string', 'in:move,attack,wait,end_turn,activate,end_activation,use_skill'], 'skill' => ['required_if:type,use_skill', 'string', 'max:48'], 'unit_id' => ['sometimes', 'string', 'max:16'],
            'target_id' => ['sometimes', 'string', 'max:16'], 'squad_id' => ['sometimes', 'string', 'max:16'], 'x' => ['sometimes', 'integer'], 'y' => ['sometimes', 'integer'],
            'facing' => ['sometimes', 'string', 'in:up,down,left,right'], 'follow' => ['sometimes', 'boolean'],   // end_turn 전용, 방 옵션 follow_troops=true일 때만 효력
        ]);
        if (array_key_exists('follow', $d)) {
            $d['follow'] = (bool) $d['follow'];
        }
        [, $events, $timedOut] = $this->rooms->action($request->user(), $code, $d);
        $state = $this->rooms->poll($request->user(), $code, PHP_INT_MAX);   // 이벤트는 아래 events로 별도 반환

        return response()->json(['events' => $events, 'turn_timed_out' => $timedOut] + $state);
    }
}
