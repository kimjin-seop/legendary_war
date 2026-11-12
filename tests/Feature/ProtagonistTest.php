<?php

namespace Tests\Feature;

use App\Game\ArmyBuilder;
use App\Services\GameData;
use App\Services\ProtagonistService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ProtagonistTest extends TestCase
{
    use RefreshDatabase;

    private function guest(): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-protagonist')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'proto'])->assertCreated();

        return [(int) $r->json('user.id'), ['X-Guest-Token' => $r->json('guest_token')]];
    }

    private function answers(string $optionId): array
    {
        $out = [];
        foreach (app(ProtagonistService::class)->publicQuiz()['questions'] as $q) {
            $out[$q['id']] = $optionId;
        }

        return $out;
    }

    public function test_생성_추천_재검사_face_변경(): void
    {
        [$uid, $h] = $this->guest();
        $g = $this->withHeaders($h)->getJson('/api/protagonist')->assertOk()->assertJsonPath('protagonist.created', false);
        $this->assertCount(9, $g->json('protagonist.quiz.questions'));
        $this->assertCount(3, $g->json('protagonist.options.faces.female'));
        $this->assertSame('proto', $g->json('protagonist.display_name'));   // 게스트 '#' 앞

        // 검사로 생성: 전부 'e'가 아닌 a를 고르면 결정적 결과 -> 클래스가 5종 중 하나, 영웅 1행 지급
        $r = $this->withHeaders($h)->postJson('/api/protagonist', ['mode' => 'quiz', 'gender' => 'female', 'face' => 'female_b', 'answers' => $this->answers('a')])->assertOk();
        $cls = $r->json('protagonist.class');
        $this->assertContains($cls, ['sword', 'spear', 'archer', 'cavalry', 'heavy']);
        $r->assertJsonPath('protagonist.portrait', 'protagonist_female_b')->assertJsonPath('protagonist.hero.code', "protagonist_female_$cls")->assertJsonPath('protagonist.hero.troop_type', $cls);
        $this->assertSame(1, DB::table('user_heroes')->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')->where('user_id', $uid)->where('is_protagonist', true)->count());

        // 성별 불일치 face 거부
        $this->withHeaders($h)->postJson('/api/protagonist', ['mode' => 'skip', 'gender' => 'male', 'face' => 'female_a'])->assertStatus(422)->assertJsonPath('error.code', 'invalid_face');
        // 재검사(직접 선택): 같은 user_hero 행 유지, hero_id만 교체
        $before = app(ProtagonistService::class)->userHeroIdFor($uid);
        $this->withHeaders($h)->postJson('/api/protagonist', ['mode' => 'manual', 'class' => 'heavy', 'gender' => 'female', 'face' => 'female_b'])->assertOk()->assertJsonPath('protagonist.hero.code', 'protagonist_female_heavy');
        $this->assertSame($before, app(ProtagonistService::class)->userHeroIdFor($uid));
        // face 변경 즉시 반영 (/api/heroes portrait)
        $this->withHeaders($h)->putJson('/api/protagonist/face', ['face' => 'female_c'])->assertOk()->assertJsonPath('protagonist.portrait', 'protagonist_female_c');
        $p = collect($this->withHeaders($h)->getJson('/api/heroes')->json('heroes'))->firstWhere('protagonist', true);
        $this->assertSame('protagonist_female_c', $p['portrait']);
        $this->assertSame('proto', $p['display_name']);
        $this->withHeaders($h)->putJson('/api/protagonist/face', ['face' => 'male_a'])->assertStatus(422);

        // 재검사 일일 상한
        config(['protagonist.retest_daily_limit' => 1]);
        $this->withHeaders($h)->postJson('/api/protagonist', ['mode' => 'skip'])->assertStatus(429)->assertJsonPath('error.code', 'protagonist_retest_limit');
    }

    public function test_M2_최초_생성_동시_insert_충돌은_갱신_경로로_처리(): void
    {
        [$uid, $h] = $this->guest();
        $done = false;
        DB::listen(function ($q) use (&$done, $uid) {   // save()의 최초 조회(없음) 직후 다른 요청이 먼저 생성한 상황을 흉내
            if (! $done && str_contains($q->sql, 'user_protagonists') && str_starts_with(strtolower($q->sql), 'select')) {
                $done = true;
                DB::table('user_protagonists')->insert(['user_id' => $uid, 'gender' => 'male', 'face' => config('protagonist.default_face.male'), 'class' => 'sword', 'source' => 'auto', 'retest_count' => 0, 'created_at' => now(), 'updated_at' => now()]);
            }
        });
        $this->withHeaders($h)->postJson('/api/protagonist', ['mode' => 'manual', 'class' => 'heavy', 'gender' => 'male'])->assertOk()->assertJsonPath('protagonist.class', 'heavy');
        $this->assertSame(1, DB::table('user_protagonists')->where('user_id', $uid)->count());
    }

    public function test_M3_재검사_실패_시_일일_한도가_소모되지_않는다(): void
    {
        [$uid, $h] = $this->guest();
        $this->withHeaders($h)->postJson('/api/protagonist', ['mode' => 'skip'])->assertOk();
        config(['protagonist.retest_daily_limit' => 3]);
        DB::table('heroes')->where('code', 'protagonist_male_heavy')->delete();   // grantHero 실패 유도
        $this->withHeaders($h)->postJson('/api/protagonist', ['mode' => 'manual', 'class' => 'heavy'])->assertStatus(500);
        $this->assertSame(0, \App\Support\DailyCounter::value('protagonist_retest:user:'.$uid));
    }

    public function test_건너뛰기_기본_원형과_profile_needed_와_캠페인_전용_제외(): void
    {
        [$uid, $h] = $this->guest();
        $this->withHeaders($h)->getJson('/api/profile')->assertJsonPath('profile.protagonist_needed', false);   // 게스트는 유도 안 함
        DB::table('users')->where('id', $uid)->update(['is_guest' => false]);
        $this->withHeaders($h)->getJson('/api/profile')->assertOk()->assertJsonPath('profile.protagonist_needed', true);
        $this->withHeaders($h)->postJson('/api/protagonist', ['mode' => 'skip'])->assertOk()->assertJsonPath('protagonist.hero.code', 'protagonist_male_sword')->assertJsonPath('protagonist.source', 'skip');
        $this->withHeaders($h)->getJson('/api/profile')->assertJsonPath('profile.protagonist_needed', false);

        // 가챠 풀·컴퓨터 무작위 편성에서 제외
        $rows = app(GameData::class)->heroes();
        $this->assertArrayHasKey('protagonist_male_sword', $rows);
        $pool = json_decode((string) file_get_contents(database_path('data/gacha_pool.json')), true);
        $this->assertStringNotContainsString('protagonist_', json_encode($pool));
        $state = ['rng' => 12345];
        foreach (ArmyBuilder::randomParty($rows, 999, 99, $state) as $hr) {
            $this->assertStringStartsNotWith('protagonist_', $hr['code']);
        }
    }
}
