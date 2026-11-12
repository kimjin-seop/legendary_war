<?php

namespace App\Console\Commands;

use App\Game\ArmyBuilder;
use App\Game\EnemyV3Adapter;
use App\Game\Engine;
use App\Services\GameData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 18장 칭기즈 칸 캠페인 stages 8행(ch18_s1~s8) 적재(멱등, code 기준 upsert). 개발 DB 전용 도구(운영 DB 사용 금지).
 * 입력: database/data/stages_ch18_mongol.json (임밸런, EnemyV3Adapter 입력 형식 + stages 행 필드).
 *  - 맵은 기존 맵(pk_*, river_02, desert_01)을 재사용한다(없으면 중단). 증원 구역은 맵 meta.enemy_extra_zones에 '<stage>_<id>' 이름으로 병합(공유 맵 다른 키 불변).
 *  - guest_heroes / recommended_party.named / excluded_heroes 는 현재 엔진·스키마가 지원하지 않아 영웅 코드 존재만 검증하고 저장하지 않는다(forced_heroes는 비움: 미보유 영웅은 입장 409).
 * --dry-run: 모든 쓰기를 롤백. --force: 이미 있는 행의 이름·보상·선행 체인도 JSON 값으로 덮어씀(기본은 신규 행에만 채움).
 */
class GameSeedCh18 extends Command
{
    protected $signature = 'game:seed-ch18 {--dry-run : 검증/계획만(트랜잭션 롤백)} {--force : 기존 행의 이름·보상·선행도 덮어씀}';

    protected $description = '18장 칭기즈 칸 캠페인 ch18_s1~s8 스테이지 적재(멱등)';

    public function handle(GameData $data): int
    {
        foreach ([['stages', 'chapter'], ['stages', 'forced_heroes'], ['stages', 'triggers'], ['heroes', 'campaign_only']] as [$t, $c]) {
            if (! Schema::hasColumn($t, $c)) {
                $this->error("{$t}.{$c} 컬럼이 없습니다. 먼저 php artisan migrate 를 실행하세요.");

                return self::FAILURE;
            }
        }
        try {
            $doc = $this->json('stages_ch18_mongol.json');
            $roster = [];
            foreach ($this->json('npc_roster_v3.json')['items'] as $n) {
                $roster[$n['code']] = $n;
            }
            DB::beginTransaction();
            $this->seedStages($doc['items'], $roster, $data);
            if ($this->option('dry-run')) {
                DB::rollBack();
                $this->info('dry-run: DB 변경 없음(롤백)');
            } else {
                DB::commit();
                $this->info('seed-ch18 완료');
            }
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('중단(전체 롤백): '.$e->getMessage());

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    private function json(string $file): array
    {
        $p = database_path('data/'.$file);
        is_file($p) || throw new \RuntimeException("파일 없음: data/{$file}");

        return json_decode((string) file_get_contents($p), true, 512, JSON_THROW_ON_ERROR);
    }

    private function seedStages(array $items, array $roster, GameData $data): void
    {
        $force = (bool) $this->option('force');
        $now = now();
        $types = array_keys($data->rules()->unitTypes);
        $heroes = DB::table('heroes')->pluck('id', 'code');
        \App\Support\ScaleUpMaps::ensureFor(array_column($items, 'map'));
        $maps = DB::table('maps')->pluck('id', 'code');
        $fallbackPreset = (int) (DB::table('stages')->orderBy('id')->where('code', 'not like', 'ch%')->value('enemy_preset_id') ?: DB::table('presets')->orderBy('id')->value('id'));
        $allowedStars = ['clear', 'all_alive', 'turn_within', 'commander_hp_pct_min', 'sub_objective'];
        $codes = array_column($items, 'code');
        count($items) >= 8 && count($items) <= 12 && count(array_unique($codes)) === count($items) || throw new \RuntimeException('ch18 items는 서로 다른 8~12개여야 합니다.');
        $ids = [];
        foreach ($items as $s) {
            $code = $s['code'];
            preg_match('/^ch18_s([1-9]|1[0-2])$/', $code) || throw new \RuntimeException("허용되지 않는 스테이지 코드: {$code}");
            $mapId = (int) ($maps[$s['map']] ?? throw new \RuntimeException("{$code}: 맵 {$s['map']} 이(가) DB maps에 없습니다."));
            ($s['prerequisite'] === null || in_array($s['prerequisite'], $codes, true)) || throw new \RuntimeException("{$code}: 선행 {$s['prerequisite']} 가 입력에 없습니다.");
            foreach ($s['star_conditions'] as $c) {
                in_array($c['type'] ?? null, $allowedStars, true) || throw new \RuntimeException("{$code}: 알 수 없는 star_conditions.type");
            }
            $named = $s['recommended_party']['named'] ?? [];
            $refs = array_merge(array_column($s['guest_heroes'] ?? [], 'hero_code'), $s['excluded_heroes'] ?? [], $named);
            foreach (array_unique($refs) as $hc) {
                isset($heroes[$hc]) || throw new \RuntimeException("{$code}: 영웅 {$hc} 이(가) heroes에 없습니다(npc 시드 필요: game:seed-imjin10 --with-npc).");
            }
            $meta = json_decode((string) DB::table('maps')->where('id', $mapId)->value('meta'), true) ?: [];
            $conv = EnemyV3Adapter::convert($s, $roster, $s['culture'] ?? null);
            $squad = $conv['enemy_squad'];
            $trigRaw = $conv['triggers'];
            $zones = [];
            foreach ($conv['zones'] as $zn => $cells) {   // 공유 맵 보호: 스테이지 접두 이름으로 병합
                $zones["{$code}_{$zn}"] = $cells;
            }
            foreach ($trigRaw as $i => $t) {
                $trigRaw[$i]['zone'] = "{$code}_{$t['zone']}";
            }
            $this->validateSquad($code, $squad, $types, $conv['units_peak']);
            Engine::resolveObjective($s['objective'], $meta) !== null || $s['objective']['type'] === 'defeat_commander' || throw new \RuntimeException("{$code}: objective 해석 실패");
            if ($zones) {
                $meta['enemy_extra_zones'] = array_merge($meta['enemy_extra_zones'] ?? [], $zones);
                DB::table('maps')->where('id', $mapId)->update(['meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'updated_at' => $now]);
            }
            $trig = Engine::normalizeTriggers($trigRaw, $meta['enemy_extra_zones'] ?? [], 1, 3.0, $types);
            count($trig) === count($trigRaw) || throw new \RuntimeException("{$code}: triggers 일부가 무효(zone/turn/units 확인)");
            foreach ($conv['deferred'] as $d) {
                $this->warn("  {$code}: 엔진 미지원 트리거 {$d['id']} -> enemy_squad.deferred_triggers 로만 보존");
            }
            $r = $s['reward_proposal'];
            $forced = $s['forced_heroes'] ?? [];   // 규칙 A: ['@protagonist', ...]. 영웅 코드는 존재해야 한다
            foreach ($forced as $f) {
                $hc = is_array($f) ? ($f['hero'] ?? '') : $f;
                ($hc === '@protagonist' || DB::table('heroes')->where('code', $hc)->exists()) || throw new \RuntimeException("{$code}: forced_heroes 영웅 {$hc} 없음");
            }
            $core = ['map_id' => $mapId, 'objective' => json_encode($s['objective']), 'forced_heroes' => json_encode($forced, JSON_UNESCAPED_UNICODE), 'triggers' => json_encode($trigRaw, JSON_UNESCAPED_UNICODE),
                'enemy_squad' => json_encode($squad, JSON_UNESCAPED_UNICODE), 'enemy_extra_troops' => '[]', 'recommended_level' => (int) $s['recommended_level'],
                'enemy_level' => (int) $s['enemy_level'], 'enemy_level_offset' => (int) $s['enemy_level_offset'], 'chapter' => (int) $s['chapter'], 'updated_at' => $now];
            $rulesIn = $s['rules'] ?? null;
            $optIn = array_key_exists('optional', $s);
            $wipe = array_key_exists('rules', $s) && $s['rules'] === null;   // rules:null = 기존 rules 전부 지움
            if ($optIn) {   // 숨은 종장 집합 제외 표시: optional:true -> rules.optional, false -> 키 삭제(병합 규칙). rules:null 과 함께 오면 "지운 뒤 optional 만 남김"
                $rulesIn = (array) $rulesIn;
                $rulesIn['optional'] = $s['optional'] === true ? true : null;
                $wipe && $s['optional'] === true && DB::table('stages')->where('code', $code)->update(['rules' => null]);
            }
            ($optIn || array_key_exists('rules', $s)) && $core['rules'] = ($wipe && ($s['optional'] ?? null) !== true) ? null : \App\Support\StageRulesMerge::resolve($code, $rulesIn, $forced);   // stages.rules: 키 없음=유지 / null=지움 / 객체=병합
            $soft = ['name' => $s['name'], 'reward_exp' => (int) $r['exp'], 'reward_user_exp' => (int) $r['user_exp'], 'reward_gold' => (int) $r['gold'], 'difficulty' => (int) $s['difficulty'],
                'sort_order' => (int) $s['sort_order'], 'star_conditions' => json_encode(array_values($s['star_conditions']))];
            $q = DB::table('stages')->where('code', $code);
            if ($q->exists()) {
                $q->update($core + ($force ? $soft : []));
                $this->line("  {$code} 갱신 -> {$s['map']}");
            } else {
                DB::table('stages')->insert($core + $soft + ['code' => $code, 'enemy_preset_id' => $fallbackPreset, 'join_hero' => '[]', 'created_at' => $now]);
                $this->line("  {$code} 신규 -> {$s['map']}");
            }
            $ids[$code] = (int) DB::table('stages')->where('code', $code)->value('id');
            ! empty($s['excluded_heroes']) && $this->warn("  {$code}: excluded_heroes(".implode(',', $s['excluded_heroes']).') 는 엔진 미지원이라 저장하지 않음');
        }
        foreach ($items as $s) {   // 선행 체인: 신규(null)만 채움, --force면 덮어씀
            $p = $s['prerequisite'];
            $q = DB::table('stages')->where('id', $ids[$s['code']]);
            $force || $q->whereNull('prerequisite_stage_id');
            $q->update(['prerequisite_stage_id' => $p === null ? null : $ids[$p]]);
        }
    }

    private function validateSquad(string $code, array $squad, array $types, int $peak): void
    {
        $all = [$squad['commander']['unit_type'] ?? '', ...($squad['units'] ?? [])];
        $total = 1 + count($squad['units'] ?? []);
        foreach ($squad['squads'] ?? [] as $sq) {
            $all[] = $sq['commander']['unit_type'] ?? '';
            array_push($all, ...($sq['units'] ?? []));
            $total += 1 + count($sq['units'] ?? []);
        }
        foreach ($all as $t) {
            in_array($t, $types, true) || throw new \RuntimeException("{$code}: 알 수 없는 병종 '{$t}'");
        }
        $total <= ArmyBuilder::enemyStageCap() || throw new \RuntimeException("{$code}: 적 유닛 {$total}기 > 적 편성 상한 ".ArmyBuilder::enemyStageCap());
        $peak <= (int) config('game.max_alive_per_side_stage') || throw new \RuntimeException("{$code}: 증원 포함 적 {$peak}기 > 생존 상한 ".(int) config('game.max_alive_per_side_stage'));
    }
}
