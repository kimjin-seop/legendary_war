<?php

namespace App\Game;

/** 봇 vs 봇 완주 시뮬레이터 (순수 PHP, DB 미사용). */
final class Simulator
{
    public function __construct(private readonly Engine $engine, private readonly array $botOptions = [], private readonly ?\Closure $eventSink = null)
    {
    }

    /** @return array 종료 상태(status=finished 보장, 안전장치 초과 시 미종료) */
    public function run(array $state, int $safetySteps = 400): array
    {
        return $this->runWithStats($state, $safetySteps)['state'];
    }

    /**
     * @return array{state:array,stats:array{heals:int,kills:int,first_turn_kill:bool,turn_limit:bool}}
     */
    public function runWithStats(array $state, int $safetySteps = 400): array
    {
        $bot = new HeuristicBot($this->engine, $this->botOptions);
        $stats = ['heals' => 0, 'kills' => 0, 'first_turn_kill' => false, 'turn_limit' => false,
            'flank' => ['none' => 0, 'side' => 0, 'back' => 0], 'flank_type' => [], 'dmg_taken' => [], 'rotations' => 0, 'collapses' => 0, 'hero_first_kill' => false,
            'high_attacks' => 0, 'cover_hits' => 0, 'village_heal' => 0,
            // 교대 행동 지표(off면 activations=0, first_hero_loss_side=null): 활성화 수 / 종료 라운드 / 선공 진영 승리 / 첫 영웅 처치를 당한 쪽과 그쪽의 최종 승리
            'activations' => 0, 'skill_uses' => 0, 'skill_uses_by_template' => [],
            // MP 방식 지표(레거시 전투는 0/null): 소모 MP 합 / 상한 초과로 버려진 회복량 합 / MP 부족으로 스킬 대신 일반 공격한 횟수(영웅의 가장 싼 스킬 비용 > MP) / 진영별 첫 스킬 사용 라운드
            'mp_spent' => 0, 'mp_overflow' => 0, 'skill_blocked_by_mp' => 0, 'skill_first_use_turn' => ['a' => null, 'b' => null], 'rounds' => 0, 'first_side' => $state['first_side'] ?? 'a', 'first_side_won' => null, 'first_hero_loss_side' => null, 'first_hero_loss_side_won' => null];
        $alt = Engine::altOn($state);
        $alt && $safetySteps = max($safetySteps, 4000);   // 교대 행동은 plan 1회 = 부대 1개이므로 반복 상한 확대
        $sides = array_map(fn ($u) => $u['side'], $state['units']);
        $kinds = array_map(fn ($u) => $u['kind'], $state['units']);
        $firstKillSeen = false;
        $types = array_map(fn ($u) => $u['type'], $state['units']);   // id -> 병종(유닛 사망 후에도 조회)
        for ($i = 0; $i < $safetySteps && $state['status'] === 'active'; $i++) {
            $plan = $alt ? $bot->planActivation($state, $state['side']) : $bot->plan($state, $state['side']);
            if ($alt && ! $plan['actions']) {
                break;   // 활성화 가능한 부대가 없음(비정상): 무한 루프 방지
            }
            $state['rng'] = $plan['rng'];
            foreach ($plan['actions'] as $a) {
                $turn = $state['turn'];
                $au = $state['units'][$a['unit_id'] ?? ''] ?? null;   // MP 부족 차단 집계: MP 방식 영웅이 일반 공격을 고른 시점의 MP < 가장 싼 스킬 비용
                if (Engine::mpOn($state) && ($a['type'] ?? '') === 'attack' && $au && isset($au['mp_max']) && ! empty($au['actives'])
                    && (int) $au['mp'] < min(array_map(fn ($d) => (int) ($d['mp_cost'] ?? MpRules::cost((string) $d['template'], (array) ($d['params'] ?? []))), $au['actives']))) {
                    $stats['skill_blocked_by_mp']++;
                }
                $beforeFacing = array_map(fn ($u) => $u['facing'] ?? null, $state['units']);
                [$state, $events] = $this->engine->apply($state, $state['side'], $a);
                $this->eventSink && ($this->eventSink)($events);   // 측정용 훅(shadow 리포트 등). 기본 null = 기존 동작
                foreach ($state['units'] as $uid => $uu) {
                    if (array_key_exists($uid, $beforeFacing) && $beforeFacing[$uid] !== ($uu['facing'] ?? null)) {
                        $stats['rotations']++;
                    }
                }
                foreach ($events as $e) {
                    if (in_array($e['type'], ['attack', 'counter'], true) && isset($types[$e['target_unit_id']])) {
                        $stats['dmg_taken'][$types[$e['target_unit_id']]] = ($stats['dmg_taken'][$types[$e['target_unit_id']]] ?? 0) + $e['dmg'];
                    }
                    if ($e['type'] === 'collapse') {
                        $stats['collapses']++;
                    }
                    if ($e['type'] === 'kill' && ! $firstKillSeen) {
                        $firstKillSeen = true;
                        $stats['hero_first_kill'] = ($kinds[$e['target_unit_id']] ?? 'troop') !== 'troop';   // 첫 처치가 영웅/지휘관
                    }
                    if ($e['type'] === 'kill' && $stats['first_hero_loss_side'] === null && ($kinds[$e['target_unit_id']] ?? 'troop') !== 'troop') {
                        $stats['first_hero_loss_side'] = $sides[$e['target_unit_id']] ?? null;   // 첫 영웅/지휘관 처치를 당한 쪽
                    }
                    if ($e['type'] === 'activation_start') {
                        $stats['activations']++;
                    }
                    if ($e['type'] === 'mp_change') {
                        ($e['reason'] ?? '') === 'skill' && $stats['mp_spent'] += -(int) $e['delta'];
                    }
                    if ($e['type'] === 'skill_use') {
                        isset($e['side']) && ($stats['skill_first_use_turn'][$e['side']] ??= $turn);
                        $stats['skill_uses']++;
                        $tpl = (string) ($e['template'] ?? '?');   // 템플릿별 집계(skill_uses는 총합 유지)
                        $stats['skill_uses_by_template'][$tpl] = ($stats['skill_uses_by_template'][$tpl] ?? 0) + 1;
                    }
                    if (in_array($e['type'], ['attack', 'counter'], true)) {
                        ($e['elevation_mult'] ?? 1.0) > 1.0 && $stats['high_attacks']++;
                        ($e['cover_mult'] ?? 1.0) < 1.0 && $stats['cover_hits']++;
                    }
                    if ($e['type'] === 'heal' && $e['actor_unit_id'] === null) {
                        $stats['village_heal'] += $e['hp_after'] - $e['hp_before'];
                    }
                    if ($e['type'] === 'attack') {
                        $fl = $e['flank'] ?? 'none';
                        $stats['flank'][$fl]++;
                        $at = $types[$e['actor_unit_id']] ?? '?';
                        $stats['flank_type'][$at][$fl] = ($stats['flank_type'][$at][$fl] ?? 0) + 1;
                    }
                    if ($e['type'] === 'heal') {
                        $stats['heals']++;
                    } elseif ($e['type'] === 'kill') {
                        $stats['kills']++;
                        $turn === 1 && $stats['first_turn_kill'] = true;
                    } elseif ($e['type'] === 'battle_end' && $e['reason'] === 'turn_limit') {
                        $stats['turn_limit'] = true;
                    }
                }
                if ($state['status'] !== 'active') {
                    break;
                }
            }
        }

        $stats['mp_overflow'] = (int) ($state['mp_overflow'] ?? 0);   // 이벤트 대신 state 누적 카운터(무변화 만땅 회복은 이벤트 미발행)
        $stats['rounds'] = (int) $state['turn'];
        $w = $state['winner'] ?? null;
        if ($state['status'] === 'finished' && $w !== null) {   // 무승부/미종료는 null
            $stats['first_side_won'] = $w === $stats['first_side'];
            $stats['first_hero_loss_side'] !== null && $stats['first_hero_loss_side_won'] = $w === $stats['first_hero_loss_side'];
        }

        return ['state' => $state, 'stats' => $stats];
    }
}
