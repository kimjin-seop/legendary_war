<?php

namespace Tests\Unit;

use App\Game\BattleStory;
use PHPUnit\Framework\TestCase;

class BattleStoryLineFxTest extends TestCase
{
    private function fx(array $line): array
    {
        $m = new \ReflectionMethod(BattleStory::class, 'lineFx');
        $m->setAccessible(true);

        return $m->invoke(null, $line);
    }

    public function test_허용_값만_통과하고_잘못된_값은_버린다(): void
    {
        $this->assertSame(['sfx' => 'sfx_battle_clash', 'shake' => true, 'bg' => 'bg.imjin.fortress', 'fade' => 'flash', 'blackout' => false],
            $this->fx(['sfx' => 'sfx_battle_clash', 'shake' => true, 'bg' => 'bg.imjin.fortress', 'fade' => 'flash', 'blackout' => false, 'text' => 'x']));
        $this->assertSame([], $this->fx(['sfx' => 'Bad Key!', 'shake' => 'huge', 'bg' => '../x', 'fade' => 'spin', 'blackout' => 'yes']));
        $this->assertSame(['shake' => 'heavy'], $this->fx(['shake' => 'heavy']));
    }

    public function test_say_cue에도_줄_효과가_검증되어_통과한다(): void
    {
        $c = \App\Game\Cues::normalize([['on' => ['battle_start' => true], 'do' => 'say', 'speaker' => 'caption', 'text' => '쿵', 'shake' => 'heavy', 'sfx' => 'sfx_battle_clash', 'fade' => 'spin']]);
        $this->assertSame(['heavy', 'sfx_battle_clash'], [$c[0]['shake'], $c[0]['sfx']]);
        $this->assertArrayNotHasKey('fade', $c[0]);
        $this->assertSame('쿵', $c[0]['text']);
    }

    public function test_근거_표기_필드_없이도_통과하고_있어도_화면에_내보내지_않는다(): void
    {
        $ev = fn ($id, $extra) => ['id' => $id, 'seq' => 1, 'priority' => 1, 'name' => $id, 'short' => $id, 'trigger' => ['type' => 'battle_start'], 'policy' => ['input' => 'locked'],
            'dialogue' => [['speaker' => 'caption', 'expr' => null, 'text' => '한 줄'] + $extra]];
        $ref = new \ReflectionProperty(BattleStory::class, 'stages');
        $ref->setAccessible(true);
        $ref->setValue(null, ['ch1_s2' => [$ev('plain', []), $ev('marked', ['is_invented' => true, 'source' => 'x', 'verify_note' => 'y', 'verify' => true, 'evidence_level' => 'pending_review'])]]);   // verify 표시가 있어도 발화한다
        try {
            $state = ['status' => 'active', 'turn' => 1, 'units' => []];
            BattleStory::initialize($state, 'ch1_s2', false);
            $out = [];
            BattleStory::collect($state, $out, true);
            $this->assertCount(2, $out);
            foreach ($out as $e) {
                $this->assertSame(['speaker', 'expr', 'text'], array_keys($e['dialogue'][0]));
            }
        } finally {
            $ref->setValue(null, null);
        }
    }
}
