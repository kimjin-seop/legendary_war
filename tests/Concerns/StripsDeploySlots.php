<?php

namespace Tests\Concerns;

use Illuminate\Support\Facades\DB;

/** 임의 타일 배치(레거시 경로)를 검증하는 테스트용: game:seed 직후 stages.rules.deploy_slots 를 제거해 슬롯 모드를 끈다(슬롯 검증은 DeploySlotsTest). */
trait StripsDeploySlots
{
    protected function stripDeploySlots(): void
    {
        foreach (DB::table('stages')->whereNotNull('rules')->get(['id', 'rules']) as $s) {
            $rules = json_decode((string) $s->rules, true);
            if (is_array($rules) && array_key_exists('deploy_slots', $rules)) {
                unset($rules['deploy_slots']);
                DB::table('stages')->where('id', $s->id)->update(['rules' => json_encode($rules, JSON_UNESCAPED_UNICODE)]);
            }
        }
    }
}
