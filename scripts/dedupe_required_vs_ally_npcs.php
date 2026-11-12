<?php
/**
 * stage_required_heroes.json 의 필수 영웅 중 같은 스테이지 rules.ally_npcs 에도 있는 항목(forced_heroes 로 옮길 때 StageRulesMerge 오류 원인) 정리.
 * 사용(개발 DB 전용): php artisan tinker --execute="require 'scripts/dedupe_required_vs_ally_npcs.php';"            -> dry-run(기본, DB 쓰기 없음)
 *                    DEDUPE_APPLY=1 php artisan tinker --execute="require '...';"                                 -> rules.ally_npcs 에서 해당 항목 제거(원본 항목은 storage/app/ally_npcs_removed_<ts>.json 에 백업)
 * 정리 방향: 필수 영웅(플레이어 조작 슬롯)이 우선, ally_npcs(AI 아군) 쪽 항목을 제거. 비교는 정확 일치 + npc_ 접두 정규화(npc_X == X).
 */
if (app()->environment('production')) { echo "운영 환경 거부\n"; return; }
$apply = getenv('DEDUPE_APPLY') === '1';
$norm = fn ($c) => preg_replace('/^npc_/', '', (string) $c);
$req = json_decode(file_get_contents(database_path('data/stage_required_heroes.json')), true);
$n = 0; $plan = []; $removed = [];
foreach ($req as $stage => $codes) {
    if ($stage[0] === '_' || ! is_array($codes) || ! array_is_list($codes)) continue;
    $row = DB::table('stages')->where('code', $stage)->first(['id', 'rules']);
    if (! $row) continue;
    $rules = json_decode((string) $row->rules, true) ?: [];
    $allies = $rules['ally_npcs'] ?? [];
    foreach ($allies as $i => $a) {
        foreach ($codes as $j => $c) {
            if ($norm($a['hero'] ?? '') === $norm($c)) {
                $n++;
                echo sprintf("%-10s hero=%-28s required[%d]=%s ally_npcs[%d]=%s\n", $stage, $c, $j, $c, $i, json_encode($a, JSON_UNESCAPED_UNICODE));
                $plan[$stage][] = $i; $removed[$stage][] = $a;
            }
        }
    }
}
echo "겹침 총 {$n}건, 스테이지 ".count($plan)."개\n";
if (! $apply) { echo "dry-run: DB 변경 없음 (DEDUPE_APPLY=1 로 적용)\n"; return; }
file_put_contents(storage_path('app/ally_npcs_removed_'.date('Ymd_His').'.json'), json_encode($removed, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
DB::transaction(function () use ($plan) {
    foreach ($plan as $stage => $idx) {
        $row = DB::table('stages')->where('code', $stage)->first(['rules']);
        $rules = json_decode((string) $row->rules, true);
        $rules['ally_npcs'] = array_values(array_filter($rules['ally_npcs'], fn ($a, $i) => ! in_array($i, $idx, true), ARRAY_FILTER_USE_BOTH));
        if ($rules['ally_npcs'] === []) unset($rules['ally_npcs']);
        DB::table('stages')->where('code', $stage)->update(['rules' => json_encode($rules, JSON_UNESCAPED_UNICODE)]);
    }
});
echo "적용 완료\n";
