<?php

namespace Tests\Feature;

use App\Game\BattleStory;
use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class BattleStoryTest extends TestCase
{
    use RefreshDatabase;

    private function campaign(): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        config(['game.first_side' => 'a', 'game.rules.alternate_activation' => false]);
        $guest = $this->postJson('/api/guests', ['nickname' => 'storytest'])->assertCreated();
        $headers = ['X-Guest-Token' => $guest->json('guest_token')];
        $stage = DB::table('stages')->where('code', 'ch1_s1')->value('id');
        $challenge = $this->withHeaders($headers)->postJson("/api/stages/$stage/challenge")->assertCreated();
        $id = $challenge->json('battle.battle_id');
        $placements = [];
        foreach ($challenge->json('deployment.default_positions') as $hero => $position) {
            $placements[] = ['user_hero_id' => (int) $hero, 'x' => $position['x'], 'y' => $position['y']];
        }
        $this->withHeaders($headers)->putJson("/api/battles/$id/deployment", ['placements' => $placements])->assertOk();
        $confirm = $this->withHeaders($headers)->postJson("/api/battles/$id/confirm")->assertOk();

        return [$headers, $id, $confirm];
    }

    public function test_campaign_start_turn_and_hp_events_persist_once(): void
    {
        [$headers, $id, $confirm] = $this->campaign();
        $confirm->assertJsonPath('battle.story_events.0.event_id', 'ch1_s1_e04');
        $this->withHeaders($headers)->getJson("/api/battles/$id")->assertOk()
            ->assertJsonCount(1, 'battle.story_events')->assertJsonPath('battle.story_events.0.dialogue.3.speaker', 'npc_jp_todo_takatora')
            ->assertJsonPath('battle.story_events.0.dialogue.5.speaker', 'hero:yi_sun_sin')
            ->assertJsonMissingPath('battle.story_events.0.dialogue.0.note');
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $state['turn'] = 3;
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state), 'turn' => 3]);
        $turn = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $stories = array_values(array_filter($turn->json('events'), fn ($event) => $event['type'] === 'story_dialogue'));
        $this->assertContains('ch1_s1_e01', array_column($stories, 'event_id'));
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $heroId = array_key_first(array_filter($state['units'], fn ($unit) => ($unit['hero'] ?? null) === 'gwak_jae_u'));
        $this->assertNotNull($heroId);
        $state['units'][$heroId]['hp'] = 50;
        $state['units'][$heroId]['max_hp'] = 100;
        $hits = [['type' => 'attack', 'target_unit_id' => $heroId, 'hp_before' => 60, 'hp_after' => 50]];
        $events = $hits;
        BattleStory::collect($state, $events);
        $this->assertSame('ch1_s1_e02', $events[1]['event_id']);
        $this->assertSame('hero:gwak_jae_u', $events[1]['dialogue'][0]['speaker']);
        $rehydrated = json_decode(json_encode($state), true);
        $events = $hits;
        BattleStory::collect($rehydrated, $events);
        $this->assertCount(1, $events); // Repeated hit/rehydration cannot fire the same story again.
        unset($rehydrated['story'], $rehydrated['story_events']);
        BattleStory::collect($rehydrated, $events);
        $this->assertArrayNotHasKey('story_events', $rehydrated); // Legacy battles stay untouched.
    }

    public function test_lethal_hit_emits_victory_without_commander_crisis_and_repeat_is_short(): void
    {
        [$headers, $id] = $this->campaign();
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $attacker = $state['units']['a0'];
        $range = max(1, (int) app(GameData::class)->rules()->unitType($attacker['type'])['range_min']);
        $x = $attacker['x'] + $range;
        $y = $attacker['y'];
        foreach ($state['units'] as $unitId => $unit) {
            if ($unitId !== 'b0' && $unitId !== 'a0' && $unit['x'] === $x && $unit['y'] === $y) {
                unset($state['units'][$unitId]);
            }
        }
        $state['units']['b0']['x'] = $x;
        $state['units']['b0']['y'] = $y;
        $state['units']['b0']['hp'] = 1;
        $state['units']['b0']['max_hp'] = 100;
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state)]);
        $result = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'attack', 'unit_id' => 'a0', 'target_id' => 'b0'])->assertOk();
        $result->assertJsonPath('battle.winner', 'a');
        $stories = array_values(array_filter($result->json('events'), fn ($event) => $event['type'] === 'story_dialogue'));
        $this->assertSame(['ch1_s1_e06'], array_column($stories, 'event_id'));
        $seqs = array_column($result->json('events'), 'seq');
        $ordered = $seqs;
        sort($ordered);
        $this->assertSame($ordered, $seqs);
        $state = ['status' => 'active', 'units' => []];
        BattleStory::initialize($state, 'ch1_s2', true);
        $events = [];
        BattleStory::collect($state, $events, true);
        $this->assertTrue($events[0]['short']);
        $this->assertCount(1, $events[0]['dialogue']);
        $this->assertSame('caption', $events[0]['dialogue'][0]['speaker']);
    }

    public function test_broken_scenario_json_falls_back_to_no_events_without_exception(): void
    {
        $ref = new \ReflectionProperty(BattleStory::class, 'stages');
        $ref->setAccessible(true);
        $ref->setValue(null, null);
        $original = app()->databasePath();
        $dir = sys_get_temp_dir().'/bs_broken_'.uniqid();
        mkdir($dir.'/data/scenario', 0777, true);
        file_put_contents($dir.'/data/scenario/battle_events_ch1_5.json', '{broken');
        app()->useDatabasePath($dir);
        try {
            $state = ['status' => 'active', 'units' => []];
            BattleStory::initialize($state, 'ch1_s1', false);
            $events = [];
            BattleStory::collect($state, $events, false);
            $this->assertSame([], $events);
        } finally {
            app()->useDatabasePath($original);
            $ref->setValue(null, null);
            @unlink($dir.'/data/scenario/battle_events_ch1_5.json');
        }
    }

    public function test_new_tile_tags_are_tolerated_as_unsupported_triggers_without_blocking_other_events(): void
    {
        $mk = fn (string $id, int $seq, array $trigger) => ['id' => $id, 'seq' => $seq, 'priority' => 1, 'name' => $id, 'short' => $id, 'trigger' => $trigger, 'dialogue' => [['speaker' => 'caption', 'expr' => null, 'text' => $id]], 'policy' => ['input' => 'locked']];
        $events = [$mk('start', 1, ['type' => 'battle_start'])];
        foreach (['sandbar', 'lure_zone', 'gate_west', 'gate_east', 'gate_south'] as $i => $tag) {
            $events[] = $mk('tile_'.$tag, 10 + $i, ['type' => 'unit_enter_tile', 'timing' => 'after_action', 'side' => 'enemy', 'tile_tag' => $tag, 'first' => true]);
        }
        $ref = new \ReflectionProperty(BattleStory::class, 'stages');
        $ref->setAccessible(true);
        $ref->setValue(null, ['ch1_s2' => $events]);
        try {
            $state = ['status' => 'active', 'turn' => 1, 'units' => []];
            BattleStory::initialize($state, 'ch1_s2', false);
            $out = [];
            BattleStory::collect($state, $out, true);
            $this->assertSame(['start'], array_column($out, 'event_id'));   // tile_tag 트리거는 미지원 = 발화하지 않고 예외도 없음
        } finally {
            $ref->setValue(null, null);
        }
    }

    public function test_ch6_to_10_events_load_and_fire_without_error(): void
    {
        $this->assertTrue(BattleStory::supports('ch1_s6'));
        $this->assertTrue(BattleStory::supports('ch1_s10'));
        $state = ['status' => 'active', 'turn' => 1, 'units' => []];
        BattleStory::initialize($state, 'ch1_s6', false);
        $out = [['type' => 'turn_start', 'side' => 'a', 'turn' => 1]];
        BattleStory::collect($state, $out, true);
        $fired = array_values(array_filter($out, fn ($e) => $e['type'] === 'story_dialogue'));
        $this->assertSame(['ch1_s6_e01'], array_column($fired, 'event_id'));
        $this->assertNotEmpty($fired[0]['dialogue']);
        // 재도전은 한 줄 요약
        $state = ['status' => 'active', 'turn' => 1, 'units' => []];
        BattleStory::initialize($state, 'ch1_s6', true);
        $out = [['type' => 'turn_start', 'side' => 'a', 'turn' => 1]];
        BattleStory::collect($state, $out, true);
        $fired = array_values(array_filter($out, fn ($e) => $e['type'] === 'story_dialogue'));
        $this->assertCount(1, $fired[0]['dialogue']);
    }
}
