<?php

namespace App\Game;

/**
 * 스킬 결과 이벤트의 FE 이펙트 슬롯(순수 함수, 상태 없음). 안아트의 키 규약 `fx.skill.<계열>.<변형>`이 확정되면 이 파일의 표만 갱신한다.
 *  - fx_family: 계열. 현재는 임시값(= 효과 종류 kind). 규약 확정 시 FAMILY 표를 규약 계열명으로 교체.
 *  - fx_variant: 변형. 속성 스킬은 element 코드, 그 외 null. 규약 확정 시 매핑 추가.
 * 이벤트 소비자는 키가 없을 수 있다고 가정해야 한다(하위 호환). 게임 규칙(피해·판정)에는 영향 없음.
 */
final class SkillFx
{
    /** 효과 종류(Engine::ACTIVE_TEMPLATES 값) -> 이펙트 계열. 임시: 계열명 = kind */
    public const FAMILY = [
        'strike' => 'strike', 'aoe' => 'aoe', 'pierce' => 'pierce', 'buff' => 'buff', 'heal' => 'heal', 'surge' => 'surge', 'stance' => 'stance',
        'decoy' => 'decoy',   // 공성계(empty_fort). 키 규약 fx.skill.decoy.base
    ];

    /** @return array{fx_family:?string,fx_variant:?string} */
    public static function fields(string $kind, ?string $element = null): array
    {
        return ['fx_family' => self::FAMILY[$kind] ?? null, 'fx_variant' => $element];
    }
}
