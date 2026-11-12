<?php

namespace Tests\Feature;

use App\Console\Commands\GameSeedShelf;
use Tests\TestCase;

/** 대사 화자(hero:*) 필드 존재 검사: ch12 는 오류, 다른 챕터는 경고만. npc_X 와 X 는 같은 인물. */
class SeedShelfSpeakerCheckTest extends TestCase
{
    private function check(int $ch, array $rules, array $s = []): void
    {
        $cmd = new GameSeedShelf;
        $cmd->setLaravel($this->app);
        $cmd->setOutput(new \Illuminate\Console\OutputStyle(new \Symfony\Component\Console\Input\ArrayInput([]), new \Symfony\Component\Console\Output\NullOutput));
        $m = new \ReflectionMethod($cmd, 'checkSpeakersOnField');
        $m->invoke($cmd, $ch, "ch{$ch}_s1", $rules, $s, []);
    }

    public function test_ch12_missing_speaker_throws_but_alias_and_other_chapters_pass(): void
    {
        $rules = ['ally_npcs' => [['hero' => 'npc_zhao_yun', 'x' => 1, 'y' => 1]], 'cues' => [['do' => 'say', 'speaker' => 'hero:zhao_yun'], ['do' => 'say', 'speaker' => 'hero:cao_cao']]];
        $s = ['enemy_squads' => [['leader' => ['ref' => 'cao_cao']]]];
        $this->check(12, $rules, $s);   // 별칭(npc_X=X)으로 통과
        $rules['cues'][] = ['do' => 'say', 'speaker' => 'hero:zhou_yu'];
        $this->check(13, $rules, $s);   // 비 strict 챕터: 예외 없음(경고)
        $this->expectException(\RuntimeException::class);
        $this->check(12, $rules, $s);
    }
}
