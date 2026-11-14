// 대사 데이터 FE 복사본 동기화: database/data(원본, 송서사 관리) -> resources/js/game/data/dialogue(빌드 포함 복사본)
// 사용: node docker/sync_dialogue_data.mjs        (프로젝트 루트에서. 원본이 갱신될 때마다 실행 후 FE 빌드)
//       node docker/sync_dialogue_data.mjs --check (복사 없이 차이만 보고, 다르면 종료 코드 1)
//   안아트 대사 배경 매핑표(public/assets/bg/scene/scene_bg_map.json)가 바뀌었을 때도 같은 명령으로 FE 사본 scenes 를 맞춘다(파일 맨 아래 블록)
// 원본 JSON 파싱 실패 시 복사하지 않는다(깨진 파일 전파 방지). 원본은 수정하지 않는다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'database', 'data');
const DST = path.join(ROOT, 'resources', 'js', 'game', 'data', 'dialogue');
const FILES = ['campaign_ch1_scenes.json', 'campaign_ch1_outline.json', 'tutorial_dialogue.json', 'campaign_main_a1_scenes.json', 'campaign_main_a2_scenes.json', 'campaign_main_a3_scenes.json', 'campaign_main_a4_scenes.json', 'ch21_legnica.json', 'ch22_panipat.json', 'ch23_hastings.json', 'ch24_tours.json', 'ch25_bachdang.json', 'ch26_caesar.json', 'ch12_redcliff.json', 'ch13_hwangsanbeol.json', 'ch16_orleans.json', 'ch11_goryeo_khitan.json', 'ch14_salsu.json', 'ch15_mediterranean.json', 'ch17_gaugamela.json', 'ch19_holy_land.json', 'ch20_nagashino.json', 'ch18_mongol.json', 'ch999_finale.json', 'ch30_legacy_stages.json']; // ch30 = 일반 스테이지 stage_02~06 대사(loadCampaign chapter 30). ch21/ch22 = 서가 21·22장(loadCampaign chapter 21/22). main_aN = 오리지널 메인 스토리 N막(chapter 100+N)
// 대사 폴더가 아닌 사본: [원본 파일명, 대상 폴더]. shelf_map_meta = 캠페인 지도 메타(campaign/campaignMapData.js 가 resources/js/game/data/ 사본을 읽음)
const EXTRA = [['shelf_map_meta.json', path.join(ROOT, 'resources', 'js', 'game', 'data')]];
const checkOnly = process.argv.includes('--check');

let diff = 0;
for (const [f, dstDir] of [...FILES.map((x) => [x, DST]), ...EXTRA]) {
    const s = path.join(SRC, f); const d = path.join(dstDir, f);
    if (!fs.existsSync(s)) { console.log(`- ${f}: 원본 없음(건너뜀)`); continue; }
    const raw = fs.readFileSync(s, 'utf8');
    let j;
    try { j = JSON.parse(raw); } catch (e) { console.error(`! ${f}: 원본 JSON 파싱 실패 — 복사 안 함 (${e.message})`); process.exitCode = 1; continue; }
    const cur = fs.existsSync(d) ? fs.readFileSync(d, 'utf8') : null;
    const same = cur === raw;
    const ver = j.version ?? j.schema_version ?? '-';
    const count = Array.isArray(j.scenes) ? `장면 ${j.scenes.length}` : Array.isArray(j.steps) ? `스텝 ${j.steps.length}` : '';
    if (same) { console.log(`= ${f}: 동일 (v${ver} ${count})`); continue; }
    diff += 1;
    if (checkOnly) { console.log(`* ${f}: 다름 (원본 v${ver} ${count})`); continue; }
    fs.writeFileSync(d, raw);
    console.log(`> ${f}: 복사 완료 (v${ver} ${count})`);
}

// 대사 배경 매핑표: 안아트 원본 public/assets/bg/scene/scene_bg_map.json 의 scenes 만 FE 사본(data/dialogue/scene_bg_map.json)에 반영한다.
// 사본 전용 필드(_bright 밝은 배경 덮개 목록, _provisional_excluded 등)는 보존. 원본 _provisional(시대 불일치 임시 대체)은 옮기지 않는다.
// 원본의 scenes 가 기준(사본에만 있는 장면 id 는 제거). manifest 에 없는 키는 경고만(FE 는 manifest 에 없으면 그라데이션 폴백)
{
    const s = path.join(ROOT, 'public', 'assets', 'bg', 'scene', 'scene_bg_map.json');
    const d = path.join(DST, 'scene_bg_map.json');
    if (!fs.existsSync(s)) console.log('- scene_bg_map.json: 원본 없음(건너뜀)');
    else {
        let src; let dst;
        try { src = JSON.parse(fs.readFileSync(s, 'utf8')); dst = fs.existsSync(d) ? JSON.parse(fs.readFileSync(d, 'utf8')) : {}; } catch (e) { console.error(`! scene_bg_map.json: JSON 파싱 실패 — 반영 안 함 (${e.message})`); process.exitCode = 1; src = null; }
        if (src) {
            const next = { ...dst, scenes: { ...(src.scenes ?? {}) } };
            const same = JSON.stringify(next.scenes) === JSON.stringify(dst.scenes ?? {});
            const n = Object.keys(next.scenes).length;
            try {
                const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', 'manifest.json'), 'utf8'));
                const keys = new Set((man.items ?? []).map((i) => i.key));
                const miss = Object.entries(next.scenes).filter(([, k]) => !keys.has(k)).map(([id, k]) => `${id}=${k}`);
                if (miss.length) console.log(`  ! manifest 에 없는 배경 키 ${miss.length}건: ${miss.join(', ')}`);
            } catch { /* manifest 없음: 확인 생략 */ }
            if (same) console.log(`= scene_bg_map.json: 동일 (장면 ${n})`);
            else if (checkOnly) { diff += 1; console.log(`* scene_bg_map.json: 다름 (원본 장면 ${n} / 사본 ${Object.keys(dst.scenes ?? {}).length})`); }
            else { fs.writeFileSync(d, `${JSON.stringify(next, null, 2)}\n`); console.log(`> scene_bg_map.json: scenes 반영 (장면 ${n})`); }
        }
    }
}
if (checkOnly && diff) process.exitCode = 1;
