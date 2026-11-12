<?php

namespace Tests\Unit;

use App\Game\Cues;
use App\Game\EventConditions;
use PHPUnit\Framework\TestCase;

/** 이벤트 조건 평가기(순수) + Cues on.when/set_flag 정규화. 핵심 동작만. */
class EventConditionsTest extends TestCase
{
    private function state(): array
    {
        $u = fn ($id, $side, $kind, $x, $y, $hp, $hero = null) => ['id' => $id, 'side' => $side, 'kind' => $kind, 'x' => $x, 'y' => $y, 'hp' => $hp, 'max_hp' => 100, 'hero' => $hero];

        return ['turn' => 3, 'flags' => ['bridge' => true], 'defeated' => ['b7' => ['side' => 'b', 'kind' => 'troop', 'hero' => null]], 'units' => [
            'a0' => $u('a0', 'a', 'commander', 5, 5, 40), 'n0' => $u('n0', 'a', 'hero', 6, 5, 100, 'gwak_jae_u'),
            'b0' => $u('b0', 'b', 'commander', 7, 5, 100), 'b1' => $u('b1', 'b', 'troop', 12, 9, 100),
        ]];
    }

    public function test_조건_트리_리프가_상태를_평가한다(): void
    {
        $s = $this->state();
        $ok = fn (array $c) => EventConditions::evaluate(EventConditions::normalize($c), $s);
        $this->assertTrue($ok(['all' => [['type' => 'turn_gte', 'value' => 3], ['type' => 'hp_pct_lte', 'unit' => 'ally_commander', 'pct' => 50]]]));
        $this->assertTrue($ok(['type' => 'adjacent', 'a' => 'hero:gwak_jae_u', 'b' => 'enemy_commander']));   // (6,5)-(7,5)
        $this->assertFalse($ok(['type' => 'adjacent', 'a' => 'hero:gwak_jae_u', 'b' => 'b1']));
        $this->assertTrue($ok(['type' => 'in_zone', 'side' => 'b', 'rect' => [11, 8, 13, 10]]));          // b1(12,9)
        $this->assertTrue($ok(['type' => 'alive_count', 'side' => 'b', 'op' => 'lte', 'value' => 2]));
        $this->assertTrue($ok(['type' => 'defeated', 'unit' => 'b7']));
        $this->assertTrue($ok(['any' => [['type' => 'flag', 'key' => 'bridge'], ['not' => ['type' => 'turn_gte', 'value' => 9]]]]));
        $this->assertFalse($ok(['type' => 'flag', 'key' => 'gate']));
    }

    public function test_protagonist_참조는_a측_protagonist_영웅만_가리킨다(): void
    {
        $s = $this->state();
        $s['units']['p1'] = ['id' => 'p1', 'side' => 'a', 'kind' => 'hero', 'x' => 2, 'y' => 2, 'hp' => 100, 'max_hp' => 100, 'hero' => 'protagonist_m'];
        $s['units']['e1'] = ['id' => 'e1', 'side' => 'b', 'kind' => 'hero', 'x' => 9, 'y' => 9, 'hp' => 100, 'max_hp' => 100, 'hero' => 'protagonist_x'];
        $ok = fn (array $c) => EventConditions::evaluate(EventConditions::normalize($c), $s);
        $this->assertTrue($ok(['type' => 'in_zone', 'unit' => '@protagonist', 'rect' => [1, 1, 3, 3]]));
        $this->assertFalse($ok(['type' => 'in_zone', 'unit' => '@protagonist', 'rect' => [8, 8, 10, 10]]));   // b측 동명 코드는 제외
        $this->assertFalse($ok(['type' => 'in_zone', 'unit' => 'hero:gwak_jae_u', 'rect' => [1, 1, 3, 3]]));   // 기존 참조 불변
    }

    public function test_시뮬_전용_플래그를_가진_a측_지휘관도_protagonist_로_취급된다(): void
    {
        $s = $this->state();
        $s['units']['c1'] = ['id' => 'c1', 'side' => 'a', 'kind' => 'commander', 'x' => 2, 'y' => 2, 'hp' => 100, 'max_hp' => 100, 'hero' => 'gwak_jae_u', 'sim_protagonist' => true];
        $ok = fn (array $c) => EventConditions::evaluate(EventConditions::normalize($c), $s);
        $this->assertTrue($ok(['type' => 'in_zone', 'unit' => '@protagonist', 'rect' => [1, 1, 3, 3]]));
        unset($s['units']['c1']['sim_protagonist']);
        $ok = fn (array $c) => EventConditions::evaluate(EventConditions::normalize($c), $s);
        $this->assertFalse($ok(['type' => 'in_zone', 'unit' => '@protagonist', 'rect' => [1, 1, 3, 3]]));   // 플래그가 없으면 실전과 동일
    }

    public function test_잘못된_조건은_정규화에서_null이고_cue는_when_set_flag를_받는다(): void
    {
        $this->assertNull(EventConditions::normalize(['type' => 'nope']));
        $this->assertNull(EventConditions::normalize(['all' => []]));
        $cues = Cues::normalize([
            ['on' => ['when' => ['type' => 'hp_pct_lte', 'unit' => 'enemy_commander', 'pct' => 30]], 'do' => 'say', 'text' => '물러서라'],
            ['on' => ['when' => ['type' => 'defeated', 'unit' => 'b1']], 'do' => 'set_flag', 'key' => 'gate_open'],
            ['on' => ['when' => ['type' => 'bad']], 'do' => 'say', 'text' => 'x'],
        ]);
        $this->assertCount(2, $cues);
        $this->assertSame([1, 'gate_open', true], [$cues[0]['turn'], $cues[1]['key'], $cues[1]['value']]);
    }
}
