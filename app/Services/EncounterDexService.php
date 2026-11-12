<?php

namespace App\Services;

use App\Game\ArmyBuilder;
use App\Game\IllegalAction;
use Illuminate\Support\Facades\DB;

/**
 * 도감 '조우 장수' 열람 전용 목록(서가 NPC). 뽑기 풀·방 대전·랭크·시뮬 풀과 무관하며 campaign_only 는 건드리지 않는다.
 * 대상 = campaign_only npc_* 중 shelf_map_meta.json 서가 heroes 에 속하고(주인공·수레/배 오브젝트 제외) 이름 있는 인물(코드·이름이 일반 직함형이면 제외).
 * 스포일러 정책: 해당 서가(chapter)의 스테이지를 1개 이상 클리어했으면 revealed=true, 아니면 이름·한 줄 설명·생몰년을 null 로 가리고 silhouette=true.
 * 끄기: config game.encounter_dex.enabled=false (env GAME_ENCOUNTER_DEX) -> 404 encounter_dex_disabled.
 */
class EncounterDexService
{
    /** 코드에 이 단어가 있으면 일반 지휘관/병과 칭호로 보고 제외 */
    private const GENERIC_CODE = '/captain|chief|commander|guard|vanguard|rearguard|scout|vassal|elephant|pisa|infantry|cavalry|archer|phalanx|baggage|soldier|envoy|leader/i';

    /** 이름이 직무 칭호형(무명 지휘관)이면 제외 */
    private const GENERIC_NAME = '/(대장|부장|수비장|감시장|우두머리|척후장|호위장|선봉장|후위장|지휘관|기병 장수|부대장)$/u';

    public function assertEnabled(): void
    {
        config('game.encounter_dex.enabled', true) || throw new IllegalAction('encounter_dex_disabled', '조우 장수 도감을 사용할 수 없습니다.', 404);
    }

    /** @return array{heroes:list<array<string,mixed>>} */
    public function list(int $userId): array
    {
        $meta = $this->json(base_path('resources/js/game/data/shelf_map_meta.json'));
        $tips = $this->json(base_path('resources/js/game/data/hero_tips.json'))['tips'] ?? [];
        $shelves = [];     // shelf_code => [chapter, name_ko]
        $byHero = [];      // code => [[shelf_code, portrait_key|null], ...]
        foreach (($meta['shelves'] ?? []) as $s) {
            $code = (string) ($s['shelf_code'] ?? '');
            if ($code === '' || ! preg_match('/^ch(\d+)$/', $code, $m)) {
                continue;
            }
            $shelves[$code] = [(int) $m[1], (string) ($s['name_ko'] ?? $code)];
            foreach (($s['heroes'] ?? []) as $h) {
                isset($h['code']) && $byHero[$h['code']][] = [$code, $h['portrait_key'] ?? null];
            }
        }
        $cleared = DB::table('user_stage_progress')->join('stages', 'stages.id', '=', 'user_stage_progress.stage_id')
            ->where('user_stage_progress.user_id', $userId)->where('user_stage_progress.clear_count', '>=', 1)->distinct()->pluck('stages.chapter')->map(fn ($c) => (int) $c)->flip()->all();

        $out = [];
        $rows = DB::table('heroes')->where('campaign_only', 1)->where('is_protagonist', 0)->where('code', 'like', 'npc%')->orderBy('id')->get(['code', 'name_ko', 'culture', 'troop_type', 'rarity']);
        foreach ($rows as $r) {
            if (! str_starts_with($r->code, 'npc_') || ! isset($byHero[$r->code]) || ArmyBuilder::isNonHeroObject($r->code)
                || preg_match(self::GENERIC_CODE, $r->code) || preg_match(self::GENERIC_NAME, (string) $r->name_ko)) {
                continue;
            }
            $appear = $byHero[$r->code];
            usort($appear, fn ($a, $b) => $shelves[$a[0]][0] <=> $shelves[$b[0]][0]);
            $pick = null;
            foreach ($appear as $a) {   // 클리어한 서가가 있으면 그 서가 우선, 없으면 가장 앞 서가
                if (isset($cleared[$shelves[$a[0]][0]])) {
                    $pick = $a;
                    break;
                }
            }
            $revealed = $pick !== null;
            $pick ??= $appear[0];
            $t = $tips[$r->code] ?? [];
            $out[] = [
                'code' => $r->code,
                'name_ko' => $revealed ? $r->name_ko : null,
                'culture' => $r->culture,
                'unit_type' => $r->troop_type,
                'grade' => $r->rarity,
                'one_line' => $revealed ? (($t['desc'] ?? '') !== '' ? $t['desc'] : null) : null,
                'life' => $revealed ? (($t['life'] ?? '') !== '' ? $t['life'] : null) : null,
                'shelf_code' => $pick[0],
                'shelf_name' => $shelves[$pick[0]][1],
                'portrait_key' => $pick[1] ?: 'portrait.'.$r->code,
                'revealed' => $revealed,
                'silhouette' => ! $revealed,
            ];
        }

        return ['heroes' => $out];
    }

    private function json(string $path): array
    {
        return is_file($path) ? (json_decode((string) file_get_contents($path), true) ?: []) : [];
    }
}
