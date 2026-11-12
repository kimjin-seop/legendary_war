<?php

namespace App\Console\Commands;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 캠페인 1장(ch1) 7스테이지 적재: database/data/stages_ch1_proposal.json -> stages (code 기준, 멱등).
 * 기본: 없는 행만 추가(기존 ch1 행·어드민 수정값 보존). --force: ch1 행만 JSON 값으로 덮어씀. 코드가 ch1_로 시작하지 않는 행(기존 stage_01~06)과 maps/presets는 절대 변경하지 않는다.
 * map(pk_*)은 DB maps.code로 매핑하며 없으면 실패(맵 적재는 game:seed / game:seed-map-pack 담당). --dry-run: 쓰기 없이 계획만 출력.
 * guest_heroes(출전 강제/게스트)는 이번 범위 제외라 무시하고, join_hero(first_clear)만 stages.join_hero에 저장한다.
 */
class GameSeedCh1 extends Command
{
    protected $signature = 'game:seed-ch1 {--dry-run : DB에 쓰지 않고 적재 계획만 출력} {--force : 기존 ch1 행을 JSON 값으로 덮어씀(ch1_ 코드 행만)} {--path= : 입력 JSON 경로(기본: stages_ch1_proposal_v2.json 우선(없으면 v1), 테스트용)}';

    protected $description = '캠페인 1장(ch1_s1~s7) 스테이지 멱등 적재(기존 stage_01~06 불변)';

    private const NEW_COLUMNS = ['chapter', 'objective', 'star_conditions', 'enemy_squad', 'join_hero'];

    public function handle(): int
    {
        $v2 = database_path('data/stages_ch1_proposal_v2.json');   // 기본 입력: v2(지휘관 단위 단일 병종) 우선, 없으면 v1
        $path = $this->option('path') ?: (is_file($v2) ? $v2 : database_path('data/stages_ch1_proposal.json'));
        $doc = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        if (! is_array($doc) || ! is_array($doc['items'] ?? null) || ! is_array($doc['enemy_presets'] ?? null)) {
            $this->error('입력 JSON을 읽을 수 없거나 items/enemy_presets가 없습니다: '.$path);

            return self::FAILURE;
        }
        foreach (self::NEW_COLUMNS as $c) {
            if (! Schema::hasColumn('stages', $c)) {
                $this->error("stages.{$c} 컬럼이 없습니다. 먼저 php artisan migrate 를 실행하세요.");

                return self::FAILURE;
            }
        }
        try {
            $rows = $this->build($doc);
        } catch (\RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }
        $force = (bool) $this->option('force');
        $dry = (bool) $this->option('dry-run');
        $existing = DB::table('stages')->whereIn('code', array_column($rows, 'code'))->pluck('id', 'code');
        $fallbackPreset = (int) (DB::table('stages')->orderBy('id')->where('code', 'not like', 'ch1_%')->value('enemy_preset_id') ?: DB::table('presets')->orderBy('id')->value('id'));
        $plan = [];
        foreach ($rows as $r) {
            $plan[$r['code']] = ! isset($existing[$r['code']]) ? 'insert' : ($force ? 'update' : 'skip(기존 행 보존)');
        }
        foreach ($plan as $code => $act) {
            $this->line(sprintf('%-8s %s', $code, $act));
        }
        if ($dry) {
            $this->info('dry-run: DB 변경 없음');

            return self::SUCCESS;
        }
        DB::transaction(function () use ($rows, $existing, $force, $fallbackPreset) {
            $now = now();
            foreach ($rows as $r) {
                unset($r['_prerequisite']);
                if (! isset($existing[$r['code']])) {
                    DB::table('stages')->insert($r + ['enemy_preset_id' => $fallbackPreset, 'created_at' => $now, 'updated_at' => $now]);
                } elseif ($force) {
                    DB::table('stages')->where('id', $existing[$r['code']])->update($r + ['updated_at' => $now]);   // enemy_preset_id·prerequisite는 별도 처리(아래)
                }
            }
            $ids = DB::table('stages')->whereIn('code', array_column($rows, 'code'))->pluck('id', 'code');
            foreach ($rows as $r) {   // 선행 체인: s1=null, s2.. = 직전 ch1 스테이지. 비-force는 비어 있는 경우만 채움
                $p = $r['_prerequisite'];
                $q = DB::table('stages')->where('id', $ids[$r['code']]);
                $force ? $q->update(['prerequisite_stage_id' => $p === null ? null : $ids[$p]]) : ($p !== null && $q->whereNull('prerequisite_stage_id')->update(['prerequisite_stage_id' => $ids[$p]]));
            }
        });
        $this->info(sprintf('seed-ch1 완료: ch1 스테이지 %d행 (%s)', DB::table('stages')->where('code', 'like', 'ch1_%')->count(), $force ? '--force' : '기존 행 보존'));

        return self::SUCCESS;
    }

    /** @return array<int,array<string,mixed>> 검증을 마친 stages 행(+ _prerequisite 임시 키) */
    private function build(array $doc): array
    {
        $maps = DB::table('maps')->pluck('id', 'code');
        $heroes = DB::table('heroes')->pluck('id', 'code');
        $presets = array_column($doc['enemy_presets'], null, 'code');
        $types = DB::table('unit_types')->pluck('code')->all();
        $out = [];
        foreach ($doc['items'] as $s) {
            $code = (string) ($s['code'] ?? '');
            if (! preg_match('/^ch1_s[1-9]$/', $code)) {
                throw new \RuntimeException("허용되지 않는 스테이지 코드: {$code} (ch1_sN만 적재)");
            }
            $mapId = $maps[$s['map'] ?? ''] ?? throw new \RuntimeException("{$code}: 맵 {$s['map']} 이(가) DB maps에 없습니다(적재 중단).");
            $ep = $presets[$s['enemy_preset'] ?? ''] ?? throw new \RuntimeException("{$code}: enemy_preset {$s['enemy_preset']} 정의 없음");
            $all = array_merge([$ep['commander']['unit_type'] ?? ''], $ep['units'] ?? []);
            foreach ($all as $t) {
                in_array($t, $types, true) || throw new \RuntimeException("{$code}: 알 수 없는 병종 {$t}");
            }
            if (isset($ep['commander']['troop_type'])) {   // v2: 지휘관 단위 단일 병종, 허용 4종(heavy·마법·치유·비행 거부)
                $allowed = ['sword', 'spear', 'cavalry', 'archer', 'gunner'];
                foreach (array_merge([$ep['commander']['troop_type']], $all) as $t) {
                    in_array($t, $allowed, true) || throw new \RuntimeException("{$code}: 허용되지 않는 병종 {$t} (허용: ".implode('|', $allowed).')');
                }
            }
            $obj = $s['objective'] ?? ['type' => 'defeat_commander'];
            if (($obj['type'] ?? null) === 'survive_turns') {
                Engine::normalizeObjective($obj) !== null || throw new \RuntimeException("{$code}: survive_turns.turns 값이 잘못되었습니다.");
            } elseif (($obj['type'] ?? null) !== 'defeat_commander') {
                throw new \RuntimeException("{$code}: 알 수 없는 objective.type");
            }
            foreach ($s['star_conditions'] ?? [] as $c) {
                in_array($c['type'] ?? null, ['clear', 'all_alive', 'turn_within', 'commander_hp_pct_min', 'sub_objective'], true) || throw new \RuntimeException("{$code}: 알 수 없는 star_conditions.type");
            }
            $join = [];
            foreach ($s['join_hero'] ?? [] as $j) {   // guest_heroes는 무시(범위 제외)
                isset($heroes[$j['hero_code'] ?? '']) || throw new \RuntimeException("{$code}: join_hero 영웅 {$j['hero_code']} 이(가) heroes에 없습니다.");
                $join[] = ['hero_code' => $j['hero_code'], 'condition' => $j['condition'] ?? 'first_clear'];
            }
            if (count($ep['units'] ?? []) + 1 > ArmyBuilder::GENERIC_MAX_UNITS) {
                throw new \RuntimeException("{$code}: 적 유닛 수가 상한(".ArmyBuilder::GENERIC_MAX_UNITS.')을 초과합니다.');
            }
            $out[] = [
                'code' => $code, 'name' => $s['name'], 'map_id' => (int) $mapId,
                'recommended_level' => (int) $s['recommended_level'], 'enemy_level' => (int) $s['enemy_level'], 'enemy_level_offset' => (int) ($s['enemy_level_offset'] ?? 0),
                'reward_exp' => (int) $s['reward_exp'], 'reward_user_exp' => (int) $s['reward_user_exp'], 'reward_gold' => (int) $s['reward_gold'],
                'difficulty' => (int) $s['difficulty'], 'sort_order' => (int) $s['sort_order'],
                'enemy_extra_troops' => '[]',   // 일반 지휘관 편성(enemy_squad.units)이 전체 부대를 담으므로 extra는 사용하지 않는다(중복 방지)
                'chapter' => (int) ($doc['chapter'] ?? 1),
                'objective' => json_encode($obj),
                'star_conditions' => json_encode(array_values($s['star_conditions'] ?? [])),
                'enemy_squad' => json_encode(['code' => $ep['code'], 'name' => $ep['name'] ?? null, 'commander' => $ep['commander'], 'units' => array_values($ep['units'] ?? [])], JSON_UNESCAPED_UNICODE),
                'join_hero' => json_encode($join),
                '_prerequisite' => $s['prerequisite'] ?? null,
            ];
        }
        // 선행 체인 검증: 모두 ch1 코드이고 같은 파일 안에 있어야 한다.
        $codes = array_column($out, 'code');
        foreach ($out as $r) {
            ($r['_prerequisite'] === null || in_array($r['_prerequisite'], $codes, true)) || throw new \RuntimeException("{$r['code']}: 선행 스테이지 {$r['_prerequisite']} 가 입력에 없습니다.");
        }

        return $out;
    }
}
