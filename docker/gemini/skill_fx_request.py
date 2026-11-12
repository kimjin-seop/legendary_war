# 스킬 ID -> 이펙트 키 매핑표·연결 요청서 생성(안아트 2026-11-06). 앱 코드·DB 수정 없음.
# 입력: 서빙 DB skills/hero_skills 읽기 전용 덤프 JSON(id, code, name, type, template, params, hero_codes)
#   덤프: docker exec laravel-app-app-1 php -r '...PDO SQLITE_OPEN_READONLY...' > db_skills.json
# 실행(저장소 루트): python docker/gemini/skill_fx_request.py <db_skills.json>
import sys, json, re

DB = json.load(open(sys.argv[1], encoding='utf-8'))['rows']
FRAG = {it['key']: it for it in json.load(open('public/assets/fx/skills/manifest_fragment_skill_fx.json', encoding='utf-8'))['items']}
KIND = {'T_ACTIVE_STRIKE': 'strike', 'T_ACTIVE_AOE': 'aoe', 'T_ACTIVE_PIERCE': 'pierce', 'T_ACTIVE_BUFF': 'buff', 'T_ACTIVE_HEAL': 'heal',
        'T_ACTIVE_SURGE': 'surge', 'T_ACTIVE_STANCE': 'stance', 'T_ACTIVE_DECOY': 'decoy'}
ELEMS = ('fire', 'thunder', 'water_ice', 'poison')
PASSIVE = {'T_ATK_UP': 'atk', 'T_FIRST_STRIKE': 'atk', 'T_CHARGE': 'atk', 'T_PURSUIT': 'atk', 'T_SIEGE_ATK': 'atk', 'T_VS_TYPE_ATK': 'atk',
           'T_COUNTER_ATK': 'atk', 'T_ATKDEF_HYBRID': 'atk', 'T_DEF_UP': 'def', 'T_TERRAIN_DEF': 'def', 'T_LAST_STAND': 'def',
           'T_FORMATION': 'def', 'T_MATCHUP_NEGATE': 'def', 'T_TERRAIN_MASTER': 'def', 'T_HEAL_UP': 'heal', 'T_REGEN': 'heal'}

has = lambda pat, s: re.search(pat, s) is not None
FIRE, WATER, THUNDER = r'불|화염|화공', r'물길|해협|살라미스|상륙|삼단노선|학익', r'번개|전광|질풍|바람|속전'
CHARGE = r'돌격|돌파|돌진|코끼리|뿔|기병|선두|선봉|성문'
GUN = r'포|화승총|투석|석궁'
BOW = r'화살|궁|사격|활|연노|일제'
RALLY = r'호령|독려|격려|연설|함성|지휘|부르는 말|고취|결속|결의'

def pick(s):
    kind = KIND.get(s['template']); p = json.loads(s['params'] or '{}'); name = s['name']; el = p.get('element')
    why = []
    if kind == 'strike':
        if el in ELEMS: k = f'strike.{el}'; why.append('element')
        elif has(FIRE, name): k = 'strike.fire'; why.append('이름: 불')
        elif has(THUNDER, name): k = 'strike.thunder'; why.append('이름: 번개·질풍')
        elif has(WATER, name) or s['code'] == 'naval_barrage': k = 'strike.water'; why.append('이름: 물·수전')
        elif has(CHARGE, name) or s['code'] == 'cavalry_charge': k = 'strike.charge'; why.append('이름: 돌격')
        elif s['code'] == 'horde_arrows': k = 'strike.charge'; why.append('기마 궁술: 단일 대상 STRIKE 라 돌격 충격으로(화살 단일 시트 없음, verify)')
        else: k = 'strike.base'
    elif kind == 'aoe':
        if el in ELEMS: k = f'aoe.{el}'; why.append('element')
        elif has(FIRE, name): k = 'aoe.fire'; why.append('이름: 불')
        elif has(GUN, name) or has(r'해전|함포', name): k = 'aoe.shot'; why.append('이름: 화포·사격')
        elif has(BOW, name) or has(r'대군', name): k = 'aoe.base'; why.append('이름: 화살·일제')
        else: k = 'aoe.scheme'; why.append('책략·논증류(병기 없음)')
    elif kind == 'pierce':
        if el in ELEMS: k = f'pierce.{el}'; why.append('element')
        elif has(WATER, name): k = 'pierce.water_ice'; why.append('이름: 해협')
        else: k = 'pierce.base'
    elif kind == 'buff':
        st = p.get('stat')
        if st == 'move': k = 'surge.base'; why.append('stat move -> 기동 연출')
        elif st == 'atk' and has(RALLY, name): k = 'buff.rally'; why.append('이름: 호령·독려')
        elif st == 'atk': k = 'buff.atk'
        elif st == 'def' and (p.get('duration', 1) >= 2): k = 'buff.holy'; why.append('2턴 강화 방벽 -> 금빛')
        elif st == 'def': k = 'buff.def'
        else: k = 'buff.holy'
    elif kind == 'heal':
        k = 'heal.area' if (p.get('radius') or 0) >= 1 else 'heal.single'
    elif kind == 'surge':
        if el in ELEMS: k = f'surge.{el}'; why.append('element')
        elif has(THUNDER, name): k = 'surge.thunder'; why.append('이름: 번개·바람')
        elif has(WATER, name): k = 'surge.water_ice'; why.append('이름: 물길·상륙')
        else: k = 'surge.base'
    elif kind == 'stance':
        if el in ELEMS: k = f'stance.{el}'
        elif has(WATER, name): k = 'stance.water_ice'; why.append('이름: 학익(수전)')
        else: k = 'stance.base'
    elif kind == 'decoy':
        k = 'decoy.base'
    else:
        k = None
    return kind, el, k, why, p

PLAY = {
    'strike': {'at': 'target', 'anchor': '시트 anchor 를 대상 유닛 몸통(발밑 -26px) 또는 발밑(thunder·water_ice·water)에 맞춤', 'start': '공격 모션 타격 프레임(FxManager.hit 직전)', 'layer': '유닛 위', 'flip': 'strike.base·charge 는 시전자가 왼쪽을 볼 때 flipX'},
    'pierce': {'at': 'target', 'anchor': '타격점 = 대상 몸통 왼쪽면(시전자 쪽). 창끝 선이 시전자 쪽으로 약 60px 뻗음', 'start': '돌진 완료 순간', 'layer': '유닛 위', 'flip': '시전자가 왼쪽을 보면 flipX'},
    'aoe': {'at': 'target_tile_center', 'anchor': '중심 칸 몸통 높이(발밑 -12px). 160px 캔버스가 3x3 칸(52px x3 = 156)을 덮음', 'start': 'skill_use 직후, 첫 착탄 프레임(약 0.1초)에 피해 숫자', 'layer': '유닛 위(지면 고리 포함 1장)', 'flip': 'aoe.base 는 시전자가 오른쪽에 있으면 flipX'},
    'buff': {'at': 'caster', 'anchor': '시전자 발밑(buff.rally 만 머리 = 발밑 -26px)', 'start': 'skill_use 즉시(모으기 링 대신 또는 뒤)', 'layer': '유닛 위(기둥 반투명)', 'flip': '없음', 'area': 'radius 내 아군에는 passive.atk/def 를 0~120ms 엇갈려 재생(선택)'},
    'heal': {'at': 'target(heal.single) / target_tile_center(heal.area)', 'anchor': '대상 발밑 / 중심 칸 발밑', 'start': '치유 숫자 팝업 200ms 전', 'layer': '유닛 위', 'flip': '없음'},
    'surge': {'at': 'caster', 'anchor': '시전자 발밑', 'start': '이동 시작 직전 1회(이동 중 따라가지 않음)', 'layer': '유닛 위', 'flip': '없음'},
    'stance': {'at': 'caster', 'anchor': '시전자 발밑', 'start': 'skill_use 즉시', 'layer': '지면 고리는 유닛 뒤가 이상적이나 1장이므로 유닛 위 + 알파 유지', 'flip': '없음'},
    'decoy': {'at': 'caster', 'anchor': '시전자 발밑', 'start': 'skill_use 즉시', 'layer': '유닛 위', 'flip': '없음'},
    'passive': {'at': 'unit', 'anchor': '유닛 머리끝(발밑 -56px)', 'start': '패시브 발동 팝업과 동시(기존 이름 텍스트 유지)', 'layer': '유닛 위', 'flip': '없음'},
}

act, pas = [], []
for s in DB:
    if s['type'] == 'active':
        kind, el, k, why, p = pick(s)
        fk = f'fx.skill.{k}' if k else None
        assert fk is None or fk in FRAG, fk
        act.append({'skill_id': int(s['id']), 'code': s['code'], 'name': s['name'], 'template': s['template'],
                    'fx_family': kind, 'fx_variant': el, 'fx_key': fk,
                    'by': ('이름 기반 추천: ' + ', '.join(why)) if why and why != ['element'] else ('element' if why else '기본 규칙'),
                    'heroes': (s.get('hero_codes') or '').split(',') if s.get('hero_codes') else []})
    else:
        c = PASSIVE.get(s['template'])
        pas.append({'skill_id': int(s['id']), 'code': s['code'], 'template': s['template'], 'fx_key': f'fx.skill.passive.{c}' if c else None})

from collections import Counter
cnt = Counter(a['fx_key'] for a in act)
out = {
    '_note': '윤프론 연결 요청서(안아트 2026-11-06). 앱 코드 미수정. 서빙 DB skills(액티브 180·패시브 368) 읽기 전용 덤프 기준. 생성 docker/gemini/skill_fx_request.py',
    'key_rule': 'fx.skill.<fx_family>.<variant>. fx_family = 서버 skill_use.fx_family(strike/aoe/pierce/buff/heal/surge/stance) + decoy·passive(서버 FAMILY 표 미포함). variant = fx_variant(fire/thunder/water_ice/poison) 또는 base/하위 연출',
    'resolve_order': [
        '1) by_skill[skill_id].fx_key (이름 기반 추천 포함, 이 표가 우선)',
        '2) fx.skill.<fx_family>.<fx_variant> (fx_variant 가 있고 manifest 에 키가 있으면)',
        '3) family_default[fx_family] (buff 는 params.stat, heal 은 params.radius 로 분기)',
        '4) 키가 없거나 로드 실패면 기존 SkillFx.js 코드 드로잉(현행 유지)'],
    'family_default': {'strike': 'fx.skill.strike.base', 'aoe': 'fx.skill.aoe.base', 'pierce': 'fx.skill.pierce.base',
                       'buff': {'atk': 'fx.skill.buff.atk', 'def': 'fx.skill.buff.def', 'move': 'fx.skill.surge.base', '*': 'fx.skill.buff.holy'},
                       'heal': {'radius0': 'fx.skill.heal.single', 'radius1+': 'fx.skill.heal.area'},
                       'surge': 'fx.skill.surge.base', 'stance': 'fx.skill.stance.base', 'decoy': 'fx.skill.decoy.base'},
    'family_variant_matrix': {f: {v: (f'fx.skill.{f}.{v}' if f'fx.skill.{f}.{v}' in FRAG else None) for v in ('base',) + ELEMS}
                              for f in ('strike', 'aoe', 'pierce', 'surge', 'stance')},
    'extra_variants': ['fx.skill.strike.charge', 'fx.skill.strike.water', 'fx.skill.aoe.shot', 'fx.skill.aoe.scheme', 'fx.skill.buff.atk',
                       'fx.skill.buff.def', 'fx.skill.buff.rally', 'fx.skill.buff.holy', 'fx.skill.heal.single', 'fx.skill.heal.area'],
    'playback': PLAY,
    'timing_common': {'fps': '각 manifest 항목 fps_hint(12~20). 배속(settings speeds)은 fps 에 곱함', 'fxLevel': '풀 = 전체 재생 / 축약 = 시트 그대로 1회(모으기 링 생략) / 끄기 = 재생 안 함',
                      'once': '모든 시트 1회 재생(loop false), 마지막 프레임이 빈칸이라 끝나면 destroy', 'scale': '1배(1 이펙트 px = 64px 유닛 시트 1 px). 전장 유닛이 52px 로 축소 표시되면 같은 배율(52/64)을 이펙트에도 적용해 도트 크기를 맞춤',
                      'hitstop': '피해 숫자는 기존 충돌 시점에서 한 번만(SkillFx.js 원칙 유지). 시트 재생 중 히트스톱이 걸리면 시트도 멈춤',
                      'cutscene': 'BattleCutscene(풀+컷신)에서는 무대 배율에 맞춰 정수 배율 x2~x3 NEAREST 로 같은 시트 재사용 가능'},
    'load': 'scope battle. 전투 진입 시 편성 영웅 스킬의 fx_key 만 지연 로드 권장(전체 39장 PNG 합계 약 0.38MB)',
    'counts': {'active_total': len(act), 'active_mapped': sum(1 for a in act if a['fx_key']), 'by_key': dict(sorted(cnt.items(), key=lambda x: -x[1])),
               'passive_total': len(pas), 'passive_mapped': sum(1 for a in pas if a['fx_key'])},
    'backend_notes': ['decoy(T_ACTIVE_DECOY, empty_fort 1건)는 SkillFx.php FAMILY 표에 없어 fx_family 가 null 로 나감 -> decoy 추가 요청(박백엔)',
                      'element 가 실린 액티브는 현재 1건(zy_fire_aoe=fire). 이름 기반 속성 추천(불꽃의 일격 등)은 by_skill 표로만 반영 — 판정 속성으로 바꿀지는 임밸런·송서사 결정',
                      '패시브는 최소 연출: passive.atk/def/heal 3종(32px)만, T_MOVE_UP 등 null 은 이펙트 없음'],
    'by_skill': act,
    'passive_by_skill': pas,
}
json.dump(out, open('public/assets/fx/skills/skill_fx_request.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(out['counts'], ensure_ascii=False))
