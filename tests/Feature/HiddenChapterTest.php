<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\HiddenChapterService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 숨은 종장(ch999) 해금: 가짜 서가/스테이지로 판정·유지·목록 게이트 확인(실데이터에는 ch999 없음). */
class HiddenChapterTest extends TestCase
{
    use RefreshDatabase;

    private function fakeStage(string $code, int $chapter, ?array $rules = null): int
    {
        $row = (array) DB::table('stages')->orderBy('id')->first();
        unset($row['id']);
        $row = ['code' => $code, 'chapter' => $chapter, 'prerequisite_stage_id' => null, 'rules' => $rules ? json_encode($rules) : null] + $row;

        return DB::table('stages')->insertGetId($row);
    }

    private function writeMeta(array $shelves): string
    {
        $path = tempnam(sys_get_temp_dir(), 'shm');
        file_put_contents($path, json_encode(['shelves' => $shelves]));

        return $path;
    }

    public function test_필수_스테이지_전부_클리어_시_해금되고_서가가_추가돼도_유지되며_목록과_도전이_게이트된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $guest = $this->postJson('/api/guests', ['nickname' => 'hid'])->assertCreated();
        $h = ['X-Guest-Token' => $guest->json('guest_token')];
        $user = User::findOrFail($guest->json('user.id') ?? DB::table('users')->orderByDesc('id')->value('id'));

        $a1 = $this->fakeStage('fk_a1', 901);
        $a2 = $this->fakeStage('fk_a2_opt', 901, ['optional' => true]);   // 선택 스테이지는 집합 제외
        $hid = $this->fakeStage('fk_hidden', 999);
        config(['game.hidden_chapter.main_chapters' => [], 'game.hidden_chapter.meta_path' => $this->writeMeta([
            ['chapter' => 901, 'status' => 'active'], ['chapter' => 902, 'status' => 'preview'],
        ])]);
        $svc = app(HiddenChapterService::class);

        $this->assertSame([$a1], $svc->requiredStageIds());
        $this->assertFalse($svc->unlocked($user));
        $ids = collect($this->getJson('/api/stages', $h)->assertOk()->json('stages'))->pluck('id');
        $this->assertFalse($ids->contains($hid));
        $this->postJson("/api/stages/{$hid}/challenge", [], $h)->assertStatus(403);
        $this->getJson('/api/hidden-chapter', $h)->assertOk()->assertJsonPath('unlocked', false)->assertJsonPath('progress.total', 1)->assertJsonPath('chapter', null);   // 잠김: 이름·위치 비노출

        DB::table('user_stage_progress')->insert(['user_id' => $user->id, 'stage_id' => $a1, 'best_stars' => 1, 'clear_count' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertTrue($svc->unlocked($user));
        $ids = collect($this->getJson('/api/stages', $h)->assertOk()->json('stages'))->pluck('id');
        $this->assertTrue($ids->contains($hid));

        $api = $this->getJson('/api/hidden-chapter', $h)->assertOk();
        $api->assertJsonPath('unlocked', true)->assertJsonPath('progress.cleared', 1)->assertJsonPath('chapter.stages.0.code', 'fk_hidden');

        // 서가 추가(미클리어 필수 스테이지 신설)해도 이미 연 유저는 유지, 신규 유저는 잠김 계산
        $this->fakeStage('fk_b1', 903);
        config(['game.hidden_chapter.meta_path' => $this->writeMeta([['chapter' => 901, 'status' => 'active'], ['chapter' => 903, 'status' => 'active']])]);
        $this->assertFalse($svc->computeCleared($user));
        $this->assertTrue($svc->unlocked($user));
    }

    public function test_join_hero는_campaign_only_영웅도_첫_클리어에_지급하고_재호출은_멱등이다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $guest = $this->postJson('/api/guests', ['nickname' => 'jn'])->assertCreated();
        $user = User::findOrFail((int) $guest->json('user.id'));
        $base = (array) DB::table('heroes')->where('campaign_only', false)->first();
        unset($base['id']);
        DB::table('heroes')->insert(['code' => 'npc_join_test', 'campaign_only' => true, 'is_protagonist' => false] + $base);
        app()->forgetInstance(\App\Services\GameData::class);
        $svc = app(\App\Services\BattleService::class);
        $stage = (object) ['join_hero' => json_encode([['hero_code' => 'npc_join_test', 'condition' => 'first_clear']])];
        $m = new \ReflectionMethod($svc, 'grantJoinHeroes');
        $m->setAccessible(true);
        $this->assertSame([['hero' => 'npc_join_test', 'is_new' => true]], $m->invoke($svc, $user, $stage));
        $this->assertSame([['hero' => 'npc_join_test', 'is_new' => false]], $m->invoke($svc, $user, $stage));
        $this->assertSame(1, DB::table('user_heroes')->where('user_id', $user->id)->where('hero_id', DB::table('heroes')->where('code', 'npc_join_test')->value('id'))->count());
    }
}
