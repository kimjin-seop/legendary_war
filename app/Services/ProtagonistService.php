<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Models\User;
use App\Support\DailyCounter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 오리지널 주인공(캠페인 전용 영웅) 생성·검사·조회.
 * - 영웅 행: heroes(campaign_only=1, is_protagonist=1) 원형 10개. 유저 보유는 user_heroes 1행(재검사 시 hero_id만 교체).
 * - 프로필: user_protagonists(성별·face·클래스). 표시명 = 계정 사용자명('#' 앞, 최대 12자).
 * - 엔진 인터페이스: heroIdFor(userId)/userHeroIdFor(userId)/isProtagonistCode(code). (@protagonist 해석용. 전투 연동은 이 서비스 밖)
 */
class ProtagonistService
{
    public const CODE_PREFIX = 'protagonist_';

    public function available(): bool
    {
        static $cache = null;   // 요청(프로세스)당 1회만 스키마 조회

        return $cache ??= Schema::hasTable('user_protagonists') && Schema::hasColumn('heroes', 'is_protagonist');
    }

    public static function isProtagonistCode(?string $code): bool
    {
        return $code !== null && str_starts_with($code, self::CODE_PREFIX);
    }

    /**
     * 원형 영웅 10행 멱등 삽입. 등급 B(중간), hero_stat_rules.json frame(B 평탄 [16,3.5,2] x 병종 배율, 중립 프로필)을 반올림해 고정한 값.
     * troop_type = 클래스(병사 병종 고정 규칙). 스킬: 패시브 sh_atk_m(중갑 sh_def_m) + sh_def_w. unit_types에 없는 클래스는 건너뜀.
     * 반환: 새로 삽입한 행 수.
     */
    public function seedArchetypes(): int
    {
        $stats = [   // class => [hp, atk, def, [growth hp, atk, def], 대표 스킬]
            'sword' => [10, 4, 2, [3, 3.4, 3.5], 'sh_atk_m'], 'spear' => [10, 4, 2, [3, 3.4, 3.5], 'sh_atk_m'],   // hp 보너스 10·hp 성장 3 고정(2026-11-04 사용자 결정)
            'archer' => [10, 3, 1, [3, 3.5, 3.3], 'sh_atk_m'], 'cavalry' => [10, 4, 2, [3, 3.5, 3.4], 'sh_atk_m'],
            'heavy' => [10, -3, 7, [3, 3.3, 3.5], 'sh_def_m'],   // 병종 v2: 클래스 heavy(중갑 원형)는 병종 sword로 이관, 구 [19,3,2]에 Lv1 보존 보정(+11/-6/+5)
        ];
        $types = DB::table('unit_types')->pluck('id', 'code');
        $now = now();
        $n = 0;
        foreach ((array) config('protagonist.genders') as $g) {
            foreach ($stats as $cls => [$hp, $atk, $def, $gr, $skill]) {
                $code = $this->heroCode($g, $cls);
                $unit = (string) (config('game.retired_unit_types')[$cls] ?? $cls);   // 퇴역 병종 클래스는 대체 병종(sword)으로 생성
                if (! isset($types[$unit]) || DB::table('heroes')->where('code', $code)->exists()) {
                    continue;
                }
                $skillId = DB::table('skills')->where('code', $skill)->value('id');
                $id = DB::table('heroes')->insertGetId([
                    'code' => $code, 'name_ko' => '주인공', 'name_en' => 'Protagonist', 'unit_type_id' => $types[$unit], 'rarity' => 'B', 'cost' => (int) config('game.hero_cost_by_grade.B', 3),
                    'hp_bonus' => $hp, 'atk_bonus' => $atk, 'def_bonus' => $def, 'growth_hp_pct' => $gr[0], 'growth_atk_pct' => $gr[1], 'growth_def_pct' => $gr[2],
                    'skill_id' => $skillId, 'verify' => false, 'note' => '오리지널 주인공 원형(캠페인 전용)',
                    'troop_bonus' => 0, 'troop_type' => $unit, 'campaign_only' => true, 'is_protagonist' => true, 'created_at' => $now, 'updated_at' => $now,
                ]);
                $order = 0;
                foreach (array_filter([$skillId, DB::table('skills')->where('code', $cls === 'heavy' ? 'sh_hyb_w' : 'sh_def_w')->value('id')]) as $sid) {
                    DB::table('hero_skills')->insert(['hero_id' => $id, 'skill_id' => $sid, 'sort_order' => $order++, 'created_at' => $now, 'updated_at' => $now]);
                }
                $n++;
            }
        }

        return $n;
    }

    public function heroCode(string $gender, string $class): string
    {
        return self::CODE_PREFIX.$gender.'_'.$class;
    }

    /** 계정 사용자명 -> 주인공 표시명. 게스트 '이름#1234'는 '#' 앞, 최대 name_max_length자. */
    public function displayName(User $user): string
    {
        $n = (string) $user->name;
        $pos = mb_strpos($n, '#');
        if ($pos !== false && $pos > 0) {
            $n = mb_substr($n, 0, $pos);
        }

        return mb_substr(trim($n), 0, (int) config('protagonist.name_max_length', 12));
    }

    /** 엔진용: 유저의 주인공 영웅 heroes.id (미생성 null) */
    public function heroIdFor(int $userId): ?int
    {
        $v = $this->heroUserRow($userId)?->hero_id;

        return $v === null ? null : (int) $v;
    }

    /** 엔진용: 유저의 주인공 user_heroes.id (미생성 null) */
    public function userHeroIdFor(int $userId): ?int
    {
        $v = $this->heroUserRow($userId)?->id;

        return $v === null ? null : (int) $v;
    }

    public function portraitFor(int $userId): ?string
    {
        if (! $this->available()) {
            return null;
        }
        $face = DB::table('user_protagonists')->where('user_id', $userId)->value('face');

        return $face ? 'protagonist_'.$face : null;
    }

    public function needed(User $user): bool
    {
        return $this->available() && (! $user->is_guest || config('game.protagonist_for_guests', true)) && ! DB::table('user_protagonists')->where('user_id', $user->id)->exists();
    }

    private function heroUserRow(int $userId): ?object
    {
        if (! $this->available()) {
            return null;
        }

        return DB::table('user_heroes')->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')
            ->where('user_heroes.user_id', $userId)->where('heroes.is_protagonist', true)->first(['user_heroes.id', 'user_heroes.hero_id']);
    }

    // ---- 검사 ----

    private function quizData(): array
    {
        $path = config('protagonist.quiz_path') ?: database_path('data/protagonist_quiz.json');

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** 클라이언트 노출용(가중치 제외) */
    public function publicQuiz(): array
    {
        $q = $this->quizData();

        return ['version' => (int) ($q['version'] ?? 1), 'questions' => array_map(fn ($x) => [
            'id' => $x['id'], 'text' => $x['text'],
            'options' => array_map(fn ($o) => ['id' => $o['id'], 'text' => $o['text']], $x['options']),
        ], $q['questions'])];
    }

    /**
     * 채점: answers {문항id: 선택지id}. 모든 문항에 유효한 답이 있어야 한다.
     *
     * @return array{class:string,scores:array<string,int>}
     */
    public function score(array $answers): array
    {
        $classes = (array) config('protagonist.classes');
        $scores = array_fill_keys($classes, 0);
        foreach ($this->quizData()['questions'] as $q) {
            $pick = $answers[$q['id']] ?? null;
            $opt = null;
            foreach ($q['options'] as $o) {
                if (is_string($pick) && $o['id'] === $pick) {
                    $opt = $o;
                }
            }
            $opt !== null || throw new IllegalAction('invalid_answers', "문항 {$q['id']}의 답이 올바르지 않습니다.");
            foreach ($opt['weights'] as $c => $w) {
                isset($scores[$c]) && $scores[$c] += (int) $w;
            }
        }
        $best = $classes[0];
        foreach ($classes as $c) {   // 동점은 config 순서 우선(엄격한 > 비교)
            if ($scores[$c] > $scores[$best]) {
                $best = $c;
            }
        }

        return ['class' => $best, 'scores' => $scores];
    }

    // ---- 상태 ----

    public function state(User $user, bool $withQuiz = true): array
    {
        $row = $this->available() ? DB::table('user_protagonists')->where('user_id', $user->id)->first() : null;
        $limit = (int) config('protagonist.retest_daily_limit', 0);
        $used = $limit > 0 ? DailyCounter::value($this->scope($user->id)) : 0;
        $meta = $this->quizData()['classes'] ?? [];
        $uh = $row ? $this->heroUserRow($user->id) : null;
        $hero = $uh ? DB::table('heroes')->where('id', $uh->hero_id)->first(['code', 'troop_type', 'rarity']) : null;
        $out = [
            'available' => $this->available(),
            'created' => $row !== null,
            'needed' => $this->needed($user),
            'display_name' => $this->displayName($user),
            'gender' => $row->gender ?? null,
            'face' => $row->face ?? null,
            'portrait' => $row ? 'protagonist_'.$row->face : null,
            'class' => $row->class ?? null,
            'source' => $row->source ?? null,
            'resonance' => $row ? ['class' => $row->class] + ($meta[$row->class] ?? []) : null,
            'scores' => $row && $row->scores ? json_decode($row->scores, true) : null,
            'hero' => $hero ? ['code' => $hero->code, 'hero_id' => (int) $uh->hero_id, 'user_hero_id' => (int) $uh->id, 'troop_type' => $hero->troop_type, 'rarity' => $hero->rarity, 'campaign_only' => true, 'is_protagonist' => true] : null,
            'retest' => ['daily_limit' => $limit, 'used_today' => $used, 'remaining' => $limit > 0 ? max(0, $limit - $used) : null, 'allow_gender_change' => (bool) config('protagonist.allow_gender_change_on_retest')],
            'options' => [
                'genders' => (array) config('protagonist.genders'), 'faces' => config('protagonist.faces'),
                'classes' => array_map(fn ($c) => ['class' => $c, 'resonance' => $meta[$c]['resonance'] ?? null, 'summary' => $meta[$c]['summary'] ?? null], (array) config('protagonist.classes')),
                'default_class' => config('protagonist.default_class'),
            ],
        ];
        if ($withQuiz) {
            $out['quiz'] = $this->publicQuiz();
        }

        return $out;
    }

    private function scope(int $userId): string
    {
        return 'protagonist_retest:user:'.$userId;
    }

    // ---- 생성/재검사 ----

    /**
     * @param  array{mode:string,gender?:?string,face?:?string,answers?:?array,class?:?string}  $in  mode = quiz|manual|skip
     */
    public function save(User $user, array $in): array
    {
        $this->available() || throw new IllegalAction('protagonist_unavailable', '주인공 기능을 사용할 수 없습니다.', 503);
        $existing = DB::table('user_protagonists')->where('user_id', $user->id)->first();
        $gender = $in['gender'] ?? ($existing->gender ?? config('protagonist.default_gender'));
        if ($existing && $gender !== $existing->gender && ! config('protagonist.allow_gender_change_on_retest')) {
            throw new IllegalAction('gender_locked', '성별은 변경할 수 없습니다.');
        }
        $face = $in['face'] ?? (($existing && $gender === $existing->gender) ? $existing->face : config("protagonist.default_face.$gender"));
        $this->assertFace($gender, $face);

        $mode = $in['mode'];
        $answers = null;
        $scores = null;
        if ($mode === 'quiz') {
            $r = $this->score((array) ($in['answers'] ?? []));
            $class = $r['class'];
            $scores = $r['scores'];
            $answers = $in['answers'];
        } elseif ($mode === 'manual') {
            $class = (string) ($in['class'] ?? '');
            in_array($class, (array) config('protagonist.classes'), true) || throw new IllegalAction('invalid_class', '선택할 수 없는 클래스입니다.');
        } else {
            $class = (string) config('protagonist.default_class');
        }

        $write = function ($existing) use ($user, $gender, $face, $class, $mode, $answers, $scores) {
            DB::transaction(function () use ($user, $existing, $gender, $face, $class, $mode, $answers, $scores) {
                $now = now();
                $vals = ['gender' => $gender, 'face' => $face, 'class' => $class, 'source' => $mode,
                    'answers' => $answers === null ? null : json_encode($answers, JSON_UNESCAPED_UNICODE), 'scores' => $scores === null ? null : json_encode($scores), 'updated_at' => $now];
                if ($existing) {   // 재검사 상한(최초 생성은 제외). 검증 통과 후 쓰기 직전(트랜잭션 안)에 소모해 실패 시 롤백된다.
                    $limit = (int) config('protagonist.retest_daily_limit', 0);
                    if ($limit > 0 && ! DailyCounter::tryIncrement($this->scope($user->id), $limit)) {
                        throw new IllegalAction('protagonist_retest_limit', "재검사는 하루 {$limit}회까지 가능합니다.", 429);
                    }
                    DB::table('user_protagonists')->where('id', $existing->id)->update($vals + ['retest_count' => (int) $existing->retest_count + 1]);
                } else {
                    DB::table('user_protagonists')->insert($vals + ['user_id' => $user->id, 'retest_count' => 0, 'created_at' => $now]);
                }
                $this->grantHero($user->id, $gender, $class);
            });
        };
        try {
            $write($existing);
        } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
            if ($existing) {
                throw $e;
            }
            // 최초 생성 동시 호출: 상대가 먼저 만들었으므로 재조회 후 갱신 경로로 처리
            $existing = DB::table('user_protagonists')->where('user_id', $user->id)->first() ?? throw $e;
            $write($existing);
        }

        return $this->state($user, false);
    }

    /** 초상화만 변경(성별 일치 필수). 상한 없음. */
    public function changeFace(User $user, string $face): array
    {
        $row = $this->available() ? DB::table('user_protagonists')->where('user_id', $user->id)->first() : null;
        $row !== null || throw new IllegalAction('protagonist_not_created', '주인공을 먼저 생성하세요.', 409);
        $this->assertFace($row->gender, $face);
        DB::table('user_protagonists')->where('id', $row->id)->update(['face' => $face, 'updated_at' => now()]);

        return $this->state($user, false);
    }

    /** 미생성 유저에게 기본 원형 자동 지급(소급: 첫 캠페인 진입 등에서 호출). 이미 있으면 상태만 반환. 재검사로 변경 가능. */
    public function ensureDefault(User $user): array
    {
        if ($this->available() && ! DB::table('user_protagonists')->where('user_id', $user->id)->exists()) {
            if (! DB::table('heroes')->where('is_protagonist', 1)->exists()) {   // 원형이 하나도 없는 DB(마이그레이션 시점에 참조 데이터가 비어 있던 환경): 전 스테이지 주인공 필수 -> 첫 입장 시 멱등 시드
                try {
                    $this->seedArchetypes();
                } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                    // 동시 첫 입장: 다른 요청이 이미 시드함
                }
                app(\App\Services\GameData::class)->flush();   // 영웅 캐시에 새 원형 반영
            }
            $g = (string) config('protagonist.default_gender');
            $class = (string) config('protagonist.default_class');
            try {
                DB::transaction(function () use ($user, $g, $class) {
                    DB::table('user_protagonists')->insert(['user_id' => $user->id, 'gender' => $g, 'face' => config("protagonist.default_face.$g"), 'class' => $class, 'source' => 'auto', 'retest_count' => 0, 'created_at' => now(), 'updated_at' => now()]);
                    $this->grantHero($user->id, $g, $class);
                });
            } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                // 동시 호출: 이미 생성됨
            }
        }

        return $this->state($user, false);
    }

    private function assertFace(string $gender, ?string $face): void
    {
        in_array($gender, (array) config('protagonist.genders'), true) || throw new IllegalAction('invalid_gender', '성별이 올바르지 않습니다.');
        in_array($face, (array) config("protagonist.faces.$gender"), true) || throw new IllegalAction('invalid_face', '성별과 일치하는 초상화를 선택하세요.');
    }

    /** 원형 영웅을 유저에게 지급. 이미 주인공 보유 시 hero_id만 교체(레벨·장비·편성 유지). */
    private function grantHero(int $userId, string $gender, string $class): void
    {
        $heroId = DB::table('heroes')->where('code', $this->heroCode($gender, $class))->value('id');
        $heroId !== null || throw new IllegalAction('protagonist_hero_missing', '주인공 원형 데이터가 없습니다(마이그레이션 확인).', 500);
        $cur = $this->heroUserRow($userId);
        if ($cur) {
            (int) $cur->hero_id !== (int) $heroId && DB::table('user_heroes')->where('id', $cur->id)->update(['hero_id' => $heroId, 'updated_at' => now()]);
        } else {
            DB::table('user_heroes')->insert(['user_id' => $userId, 'hero_id' => $heroId, 'level' => 1, 'exp' => 0, 'shards' => 0, 'obtained_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        }
    }
}
