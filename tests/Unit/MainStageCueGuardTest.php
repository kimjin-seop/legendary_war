<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/** 메인 스토리 스테이지 데이터 가드: 승리 조건(in_zone)의 대상 유닛을 연출 move cue 로 옮기면 도달 판정이 왕복·이탈한다(ch103_s3 사례). */
class MainStageCueGuardTest extends TestCase
{
    public function test_win_conditions_in_zone_대상_유닛을_move_cue로_옮기지_않는다(): void
    {
        $checked = 0;
        foreach (glob(dirname(__DIR__, 2).'/database/data/stages_main_a*.json') as $f) {
            foreach (json_decode(file_get_contents($f), true)['items'] ?? [] as $s) {
                $targets = [];
                $wc = $s['rules']['win_conditions'] ?? [];
                array_walk_recursive($wc, function ($v, $k) use (&$targets) {
                    $k === 'unit' && is_string($v) && $targets[] = $v;
                });
                foreach ($s['rules']['cues'] ?? [] as $c) {
                    if (($c['do'] ?? null) === 'move' && $targets !== []) {
                        $this->assertNotContains($c['unit'] ?? '', $targets, $s['code'].': 승리 조건 대상 유닛을 move cue 로 이동');
                        $checked++;
                    }
                }
            }
        }
        $this->assertGreaterThan(0, $checked);
    }
}
