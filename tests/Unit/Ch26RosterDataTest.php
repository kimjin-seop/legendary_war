<?php

namespace Tests\Unit;

use App\Game\EnemyV3Adapter;
use App\Game\HeroStatRules;
use PHPUnit\Framework\TestCase;

/** ch26 카이사르 로스터 파일 무결성(DB 미사용): 스키마·hp 10 고정·감사 FAIL 0·스테이지 참조 NPC 가 로스터에 있음. */
class Ch26RosterDataTest extends TestCase
{
    private function json(string $f): array
    {
        return json_decode((string) file_get_contents(__DIR__.'/../../database/data/'.$f), true, 512, JSON_THROW_ON_ERROR);
    }

    public function test_ch26_로스터_스키마와_스테이지_참조(): void
    {
        $items = $this->json('npc_roster_shelf_ch26_caesar_add.json')['items'];
        $codes = array_column($items, 'code');
        $this->assertSame($codes, array_values(array_unique($codes)), 'code 중복');
        $rules = $this->json('hero_stat_rules.json');
        $types = array_column($this->json('unit_types.json')['items'], null, 'code');
        $gen = new HeroStatRules($rules, $types, $this->json('skill_templates.json'));
        foreach ($items as $h) {
            $this->assertStringStartsWith('npc_', $h['code']);
            $this->assertArrayHasKey($h['culture'], EnemyV3Adapter::CULTURE_MAP);
            $this->assertArrayHasKey($h['unit_type'], $types);
            $this->assertSame(10, $h['hp_bonus']);
            foreach ($gen->audit($h, null)['rows'] as [$id, $lv]) {
                $this->assertNotSame('FAIL', $lv, "{$h['code']} {$id}");
            }
        }
        $need = [];
        foreach ($this->json('stages_ch26_caesar.json')['items'] as $it) {
            foreach ($it['rules']['ally_npcs'] ?? [] as $a) {
                $need[] = $a['hero'];
            }
            foreach ($it['enemy_squads'] as $q) {
                $need[] = $q['leader']['ref'] ?? null;
            }
        }
        $existing = ['julius_caesar', 'vercingetorix', 'mark_antony'];   // mark_antony -> npc_mark_antony 개명 요청 대기(보고서)
        $missing = array_diff(array_filter(array_unique($need)), $codes, $existing);
        $this->assertSame([], array_values($missing));
    }
}
