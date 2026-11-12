<?php

namespace App\Services;

use App\Game\Cues;

/**
 * 연출 액터 cue(spawn_actor/walk/...)의 정적 검증을 맵·규칙 DB 데이터로 실행(시드 경고·game:audit-stages 공용, 읽기 전용).
 * 적대 시작 배치 = enemy_squad(+squads) cells, 없으면 맵 spawns.b. 플레이어 시작 배치 = 고정 슬롯 칸(deploy_slots.fixed).
 */
final class CueWalkAudit
{
    public function __construct(private GameData $gd)
    {
    }

    /** @return list<string> 경고/오류 문구(액터 cue 가 없으면 []) */
    public function check(int $mapId, mixed $rawCues, ?array $enemySquad = null, array $fixedSlots = []): array
    {
        $norm = Cues::normalize($rawCues);
        $has = array_filter($norm, fn ($c) => in_array($c['do'], ['spawn_actor', 'walk', 'despawn_actor', 'face', 'parallel'], true) || isset($c['actor']));
        if ($has === []) {
            return [];
        }
        $msg = array_map(fn ($m) => "WARN {$m}", Cues::validateActors($norm));
        $map = $this->gd->map($mapId);
        $rules = $this->gd->rules();
        $heroes = null;
        $b = [];
        foreach (array_merge([$enemySquad ?? []], $enemySquad['squads'] ?? []) as $one) {
            foreach ($one['cells'] ?? [] as $p) {
                $b[] = [(int) $p[0], (int) $p[1]];
            }
        }
        $b === [] && $b = array_map(fn ($p) => [(int) $p[0], (int) $p[1]], $map['spawns']['b'] ?? []);
        $a = [];
        foreach ($fixedSlots as $sl) {
            isset($sl['x'], $sl['y']) && $a[] = [(int) $sl['x'], (int) $sl['y']];
        }
        $ctx = [
            'width' => $map['width'], 'height' => $map['height'],
            'terrain' => fn (int $x, int $y) => $rules->symbols[$map['tiles'][$y][$x]] ?? 'plain',
            'cost' => fn (string $t, string $mt) => $rules->terrainMod($t, $mt)['cost'],
            'isWater' => fn (string $t) => $rules->isWater($t),
            'moveTypeOf' => function (string $kind, string $v) use ($rules, &$heroes) {
                if ($kind === 'hero') {
                    $heroes ??= $this->gd->heroes();
                    $v = $heroes[$v]['unit_type'] ?? '';
                }

                return $kind === 'npc_ref' ? null : ($rules->unitTypes[$v]['move_type'] ?? null);
            },
            'starts' => ['a' => $a, 'b' => $b],
            'passCost' => (int) ($this->gd->engine()->frozenOpts()['ally_passthrough_cost'] ?? 0),
        ];

        return array_merge($msg, Cues::validateWalk($norm, $ctx));
    }
}
