// public/assets/audio/manifest.json 생성: 슬롯 키 -> 경로/루프/볼륨/출처/라이선스/제작 방식.
// 실행(--dry = 기록 없이 비교): docker run --rm -v "$PWD":/app -w /app node:22 node docker/gemini/build_audio_manifest.mjs
import { readFileSync, statSync, writeFileSync } from 'node:fs';
const ROOT = 'public/assets/audio';
const BGM = { bgm_title: 0.45, bgm_map: 0.4, bgm_gacha: 0.45, bgm_result: 0.45 }; // bgm_lobby·bgm_battle 은 아래 조각에서(볼륨 0.6, 2026-11-02 사용자 제공 곡)
const SFX = {
  sfx_ui_tap: 0.4, sfx_ui_confirm: 0.5, sfx_ui_cancel: 0.4, sfx_move_step: 0.3, sfx_hit_normal: 0.7, sfx_hit_crit: 0.9, sfx_hit_weak: 0.5,
  sfx_hit_resist: 0.6, sfx_counter: 0.7, sfx_unit_down: 0.7, sfx_aura_pulse: 0.4, sfx_skill_cutin: 0.8, sfx_skill_hit: 0.8, sfx_turn_player: 0.5,
  sfx_turn_enemy: 0.5, sfx_exp_tick: 0.3, sfx_levelup: 0.8, sfx_cost_up: 0.6, sfx_gacha_reveal_n: 0.5, sfx_gacha_reveal_r: 0.6,
  sfx_gacha_reveal_sr: 0.7, sfx_gacha_reveal_ssr: 0.9, sfx_victory: 0.8, sfx_defeat: 0.8,
};
const slots = {};
for (const [id, volume] of Object.entries(BGM)) {
  const file = `bgm/${id}.mp3`, bytes = statSync(`${ROOT}/${file}`).size;
  slots[id] = { type: 'bgm', path: `assets/audio/${file}`, loop: true, volume, bytes, approxSeconds: Math.round((bytes * 8) / 128000),
    source: 'Google Gemini API lyria-3.5 (Interactions API), 코드로 루프 크로스페이드·128kbps 재인코딩',
    license: '확인 필요(Google Gemini API 약관상 생성물 상업 이용 범위 확인, SynthID 워터마크 포함)', method: 'ai-generated' };
}
for (const [id, volume] of Object.entries(SFX)) {
  const file = `sfx/${id}.wav`, bytes = statSync(`${ROOT}/${file}`).size;
  slots[id] = { type: 'sfx', path: `assets/audio/${file}`, loop: false, volume, bytes,
    source: 'docker/gemini/generate_sfx.mjs (코드 합성: 오실레이터·노이즈 엔벨로프, 외부 소스 없음)', license: '자체 생성물(제3자 저작물 없음)', method: 'code-synthesis' };
}
// 교전 컷신 효과음 슬롯(docker/gemini/audio_battle_sfx.mjs 생성물): 정의는 audio_battle_slots.json, bytes는 실제 파일에서 계산
const BATTLE = JSON.parse(readFileSync('docker/gemini/audio_battle_slots.json', 'utf8'));
for (const [id, def] of Object.entries(BATTLE)) {
  const { path, ...rest } = def;
  slots[id] = { type: rest.type, path, loop: rest.loop, volume: rest.volume, bytes: statSync(`public/${path}`).size, ...rest };
}
// 뽑기(역사책 소집) 효과음 슬롯(docker/gemini/gacha_sfx.mjs 생성물, 안아트-2 2026-11-03): 정의 gacha_audio_slots.json
for (const [id, def] of Object.entries(JSON.parse(readFileSync('docker/gemini/gacha_audio_slots.json', 'utf8')))) slots[id] = { ...def, bytes: statSync(`public/${def.path}`).size };
// 총병 효과음(docker/gemini/gun_sfx.mjs 생성물, 안아트 2026-11-03): 정의 gun_audio_slots.json
for (const [id, def] of Object.entries(JSON.parse(readFileSync('docker/gemini/gun_audio_slots.json', 'utf8')))) slots[id] = { ...def, bytes: statSync(`public/${def.path}`).size };
// 대사 cue 효과음(docker/gemini/story_sfx.mjs 생성물, 안아트 2026-11-03): 정의 story_audio_slots.json
for (const [id, def] of Object.entries(JSON.parse(readFileSync('docker/gemini/story_audio_slots.json', 'utf8')))) slots[id] = { ...def, bytes: statSync(`public/${def.path}`).size };
// 전투 음성(함성·비명·영웅 사망 외침, docker/gemini/battle_voice/bv_build.mjs 생성물, 안아트 2026-11-07): 정의 battle_voice/bv_audio_slots.json. 기존 키는 덮지 않는다
for (const [id, def] of Object.entries(JSON.parse(readFileSync('docker/gemini/battle_voice/bv_audio_slots.json', 'utf8')))) if (!slots[id]) slots[id] = { ...def, bytes: statSync(`public/${def.path}`).size };
// 안아트 조각 BGM(경로 배열 opus->mp3 + 루프 마커): bgm_lobby(public/assets/audio/bgm/bgm_lobby_manifest_fragment.json audioSlot). bytes 는 실제 파일에서 계산
for (const frag of ['bgm/bgm_lobby_manifest_fragment.json', 'bgm/bgm_battle_manifest_fragment.json']) {
  const slotsF = JSON.parse(readFileSync(`${ROOT}/${frag}`, 'utf8')).audioSlot ?? {};
  for (const [id, def] of Object.entries(slotsF)) slots[id] = { ...def, bytes: statSync(`public/${def.paths?.[0] ?? def.path}`).size };
}
const out = JSON.stringify({ version: 1, generatedBy: 'docker/gemini/build_audio_manifest.mjs', basePath: 'public', slots }, null, 2);
if (process.argv.includes('--dry')) { // 기록 없이 기존 파일과 슬롯 단위 비교
  const prev = JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8')).slots ?? {};
  const ids = [...new Set([...Object.keys(prev), ...Object.keys(slots)])];
  const diff = ids.filter((id) => JSON.stringify(prev[id]) !== JSON.stringify(slots[id]));
  console.log(`--dry: 슬롯 ${Object.keys(slots).length}개, 기존 대비 변경 ${diff.length}개:`, diff.join(', ') || '없음');
} else {
  writeFileSync(`${ROOT}/manifest.json`, out);
  console.log(`슬롯 ${Object.keys(slots).length}개 기록`);
}
