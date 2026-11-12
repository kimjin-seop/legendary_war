<script setup>
// 게임 데이터 편집기: entity 선택 -> 목록(서버 검색 q·페이지) -> 행 선택 -> 허용 필드만 폼 편집 -> 변경 전후 diff 미리보기 -> 사유 입력(필수) 확인 -> PATCH(바뀐 필드만).
// 허용 필드·범위 = 서버 AdminController::entities() 와 같은 표(서버가 최종 검증). 삭제 없음. 저장은 audit_logs(after._reason) 기록
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminApi, errText, short } from '../../admin/adminApi.js';
import Pager from '../../admin/components/Pager.vue';
import ConfirmModal from '../../admin/components/ConfirmModal.vue';

const I = (min, max) => ({ t: 'int', min, max });
const N = (min, max) => ({ t: 'num', min, max });
const S = (max, nullable = false) => ({ t: 'str', max, nullable });
const J = (kind) => ({ t: 'json', kind }); // kind: 'object' | 'array' | 'any'
// ro: 서버 고정값(편집 불가, 저장 본문에서 제외). 영웅 체력 고정(사용자 2026-11-04): hp_bonus = 10, growth_hp_pct = 3 만 서버가 허용
const ENT = {
    heroes: { label: '영웅', pk: 'id', show: ['code', 'name_ko'], fields: { name_ko: S(64), rarity: { t: 'enum', opts: ['S', 'A', 'B', 'C'] }, cost: I(1, 30), hp_bonus: { ...I(10, 10), ro: true }, atk_bonus: I(-100, 200), def_bonus: I(-100, 200), growth_hp_pct: { ...N(3, 3), ro: true }, growth_atk_pct: N(0, 30), growth_def_pct: N(0, 30), verify: { t: 'bool' }, note: S(255, true) } },
    'unit-types': { label: '병종', pk: 'id', show: ['code', 'name'], fields: { name: S(64), move: I(1, 12), range_min: I(1, 8), range_max: I(1, 8), hp: I(1, 2000), atk: I(0, 500), def: I(0, 500), heal: I(0, 500) } },
    matchups: { label: '상성', pk: 'id', show: ['attacker', 'defender', 'attacker_type', 'defender_type'], fields: { multiplier: N(0.1, 5) } },
    'terrain-modifiers': { label: '지형 보정', pk: 'id', show: ['terrain', 'move_type', 'code'], fields: { move_cost: { ...I(1, 20), nullable: true }, def_pct: I(-100, 300) } },
    skills: { label: '스킬', pk: 'id', show: ['code', 'name', 'kind'], fields: { name: S(64), description: S(255, true), params: J('object') } },
    maps: { label: '맵 규칙', pk: 'id', show: ['code', 'name'], fields: { rules: { ...J('object'), nullable: true } } },
    presets: { label: '프리셋', pk: 'id', show: ['code', 'name'], fields: { name: S(64), units: J('array') } },
    stages: { label: '스테이지', pk: 'id', show: ['code', 'name', 'chapter'], fields: { name: S(64), recommended_level: I(1, 100), enemy_level: I(1, 100), reward_exp: I(0, 100000), reward_user_exp: I(0, 100000), reward_gold: I(0, 1000000), difficulty: I(1, 10), enemy_extra_troops: J('array'), enemy_level_offset: I(-10, 10) } },
    'user-level-costs': { label: '유저 레벨', pk: 'level', show: ['level'], fields: { exp_to_next: I(0, 10000000), max_cost: I(1, 500), party_slots: I(1, 6) } },
    'hero-levels': { label: '영웅 레벨', pk: 'level', show: ['level'], fields: { exp_to_next: I(1, 10000000) } },
};
const route = useRoute(); const router = useRouter();
const entity = ref(ENT[route.query.e] ? String(route.query.e) : 'heroes');
const q = ref('');
const page = ref(null); const err = ref(''); const ok = ref(''); const loading = ref(false);
const sel = ref(null); // 원본 행
const form = reactive({});
const confirmOpen = ref(false); const mBusy = ref(false); const mErr = ref('');
const def = computed(() => ENT[entity.value]);
const rowKey = (r) => r[def.value.pk];
const raw = (v) => (v == null ? null : v);
const toText = (spec, v) => { if (spec.t === 'json') { if (v == null) return ''; try { return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2); } catch { return String(v); } } if (spec.t === 'bool') return !!(v === true || v === 1 || v === '1'); return v == null ? '' : String(v); };

async function load(p = 1) {
    loading.value = true; err.value = '';
    try {
        const d = await adminApi.configList(entity.value, { q: q.value.trim() || undefined, page: p, per_page: 50 });
        page.value = Array.isArray(d?.items) ? { data: d.items, current_page: 1, last_page: 1, total: d.items.length } : d;
    } catch (e) { page.value = null; err.value = errText(e); } finally { loading.value = false; }
}
function pick(r) {
    sel.value = r; ok.value = '';
    Object.keys(form).forEach((k) => delete form[k]);
    Object.entries(def.value.fields).forEach(([k, spec]) => { form[k] = toText(spec, r[k]); });
}
// 입력값 -> 전송값(검증 실패 = fErr). 바뀐 필드만 diff 로
function parse(k, spec, text) {
    if (spec.t === 'bool') return { v: !!text };
    const s = typeof text === 'string' ? text.trim() : text;
    if ((s === '' || s == null) && spec.nullable) return { v: null };
    if (spec.t === 'int') { const n = Number(s); if (!Number.isInteger(n)) return { e: '정수' }; if (n < spec.min || n > spec.max) return { e: `${spec.min}~${spec.max}` }; return { v: n }; }
    if (spec.t === 'num') { const n = Number(s); if (!Number.isFinite(n) || s === '') return { e: '숫자' }; if (n < spec.min || n > spec.max) return { e: `${spec.min}~${spec.max}` }; return { v: n }; }
    if (spec.t === 'enum') return spec.opts.includes(s) ? { v: s } : { e: spec.opts.join('/') };
    if (spec.t === 'str') { if (!spec.nullable && s === '') return { e: '필수' }; if (s.length > spec.max) return { e: `${spec.max}자 이하` }; return { v: s }; }
    if (spec.t === 'json') { try { const v = JSON.parse(s); if (spec.kind === 'array' && !Array.isArray(v)) return { e: 'JSON 배열' }; if (spec.kind === 'object' && (Array.isArray(v) || typeof v !== 'object' || v === null)) return { e: 'JSON 객체' }; return { v }; } catch { return { e: 'JSON 형식 오류' }; } }
    return { v: s };
}
const norm = (spec, v) => { if (v == null) return null; if (spec.t === 'json') { try { return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v); } catch { return String(v); } } if (spec.t === 'bool') return !!(v === true || v === 1 || v === '1'); if (spec.t === 'int' || spec.t === 'num') return Number(v); return String(v); };
const diff = computed(() => {
    if (!sel.value) return { changes: [], body: {}, bad: false, errs: {} };
    const changes = []; const body = {}; const errs = {}; let bad = false; // errs: 필드별 검증 오류(템플릿 diff.errs[k]). 이전엔 선언이 빠져 ReferenceError
    Object.entries(def.value.fields).forEach(([k, spec]) => {
        if (spec.ro) { errs[k] = ''; return; } // 고정값: 검증·전송하지 않음
        const r = parse(k, spec, form[k]);
        errs[k] = r.e ?? '';
        if (r.e) { bad = true; return; }
        const before = norm(spec, raw(sel.value[k])); const after = norm(spec, r.v);
        if (before !== after) { changes.push({ k, before: sel.value[k], after: r.v }); body[k] = r.v; }
    });
    return { changes, body, bad, errs };
});
async function save({ reason }) {
    mBusy.value = true; mErr.value = '';
    try {
        const r = await adminApi.configPatch(entity.value, rowKey(sel.value), { ...diff.value.body, reason });
        const item = r?.item ?? null;
        ok.value = `${def.value.label} #${rowKey(sel.value)} 저장 완료 (${diff.value.changes.map((c) => c.k).join(', ')})`;
        confirmOpen.value = false;
        if (item) { const list = page.value?.data ?? []; const i = list.findIndex((x) => rowKey(x) === rowKey(item)); if (i >= 0) list.splice(i, 1, item); pick(item); }
    } catch (e) { mErr.value = errText(e); } finally { mBusy.value = false; }
}
watch(entity, (e) => { router.replace({ query: { e } }); sel.value = null; q.value = ''; load(1); });
onMounted(() => load(1));
const label = (r) => def.value.show.map((k) => r[k]).filter((v) => v != null && v !== '').join(' · ');
const fmtV = (v) => (v == null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v));
</script>

<template>
    <div>
        <h1>게임 데이터</h1>
        <div class="adm-row">
            <select v-model="entity"><option v-for="(d, k) in ENT" :key="k" :value="k">{{ d.label }} ({{ k }})</option></select>
            <form class="adm-row grow" style="margin: 0" @submit.prevent="load(1)"><input v-model="q" class="grow" placeholder="이름·코드 검색" /><button class="primary" type="submit" :disabled="loading">검색</button></form>
        </div>
        <div v-if="err" class="err">{{ err }}</div>
        <div v-if="ok" class="okmsg">{{ ok }} · <RouterLink :to="{ path: '/admin/audit', query: { entity } }">감사 로그 보기</RouterLink></div>
        <div class="adm-grid" style="grid-template-columns: minmax(260px, 1fr) minmax(300px, 1.3fr)">
            <div class="adm-card adm-table-wrap">
                <table><tbody>
                    <tr><th>{{ def.pk }}</th><th>항목</th><th v-for="k in Object.keys(def.fields).slice(0, 3)" :key="k">{{ k }}</th></tr>
                    <tr v-for="r in page?.data ?? []" :key="rowKey(r)" :class="{ sel: sel && rowKey(sel) === rowKey(r) }" style="cursor: pointer" @click="pick(r)">
                        <td>{{ rowKey(r) }}</td><td>{{ label(r) }}</td><td v-for="k in Object.keys(def.fields).slice(0, 3)" :key="k" class="mono">{{ short(r[k], 24) }}</td>
                    </tr>
                    <tr v-if="page && !(page.data ?? []).length"><td colspan="5" class="muted">결과 없음</td></tr>
                </tbody></table>
                <Pager :page="page" @go="load" />
            </div>
            <div class="adm-card">
                <div v-if="!sel" class="muted">왼쪽 목록에서 항목을 선택하세요.</div>
                <template v-else>
                    <h2>{{ def.label }} #{{ rowKey(sel) }} <span class="muted" style="font-size: 13px">{{ label(sel) }}</span></h2>
                    <div v-for="(spec, k) in def.fields" :key="k">
                        <label class="f">{{ k }} <span class="muted">({{ spec.t === 'int' || spec.t === 'num' ? `${spec.min}~${spec.max}` : spec.t === 'str' ? `${spec.max}자${spec.nullable ? ', 비우면 null' : ''}` : spec.t === 'json' ? `JSON ${spec.kind === 'array' ? '배열' : '객체'}${spec.nullable ? ', 비우면 null' : ''}` : spec.t }})</span></label>
                        <input v-if="spec.t === 'bool'" v-model="form[k]" type="checkbox" />
                        <select v-else-if="spec.t === 'enum'" v-model="form[k]"><option v-for="o in spec.opts" :key="o" :value="o">{{ o }}</option></select>
                        <textarea v-else-if="spec.t === 'json'" v-model="form[k]" />
                        <input v-else v-model="form[k]" :inputmode="spec.t === 'str' ? 'text' : 'decimal'" :disabled="spec.ro" style="width: 100%; box-sizing: border-box" />
                        <div v-if="spec.ro" class="muted" style="font-size: 12px; margin-top: 2px">서버 고정값(영웅 체력 고정)이라 편집할 수 없습니다.</div>
                        <div v-if="diff.errs[k]" class="err" style="padding: 3px 8px; margin: 4px 0 0">{{ diff.errs[k] }}</div>
                    </div>
                    <h3 style="margin-top: 16px">변경 미리보기</h3>
                    <div v-if="!diff.changes.length" class="muted">변경 없음</div>
                    <table v-else class="diff"><tbody><tr><th>필드</th><th>변경 전</th><th>변경 후</th></tr>
                        <tr v-for="c in diff.changes" :key="c.k"><td>{{ c.k }}</td><td class="b mono">{{ short(fmtV(c.before), 120) }}</td><td class="a mono">{{ short(fmtV(c.after), 120) }}</td></tr>
                    </tbody></table>
                    <div class="adm-row" style="margin-top: 12px"><span class="grow" /><button @click="pick(sel)">되돌리기</button><button class="primary" :disabled="!diff.changes.length || diff.bad" @click="confirmOpen = true; mErr = ''">저장...</button></div>
                </template>
            </div>
        </div>
        <ConfirmModal v-if="confirmOpen" :title="`${def.label} #${rowKey(sel)} 저장`" :message="`${diff.changes.length}개 필드를 변경합니다. 진행 중인 전투에는 적용되지 않을 수 있습니다.`" need-reason ok-label="저장" :busy="mBusy" :error="mErr" @cancel="confirmOpen = false" @ok="save">
            <table class="diff"><tbody><tr><th>필드</th><th>전</th><th>후</th></tr>
                <tr v-for="c in diff.changes" :key="c.k"><td>{{ c.k }}</td><td class="b mono">{{ short(fmtV(c.before), 60) }}</td><td class="a mono">{{ short(fmtV(c.after), 60) }}</td></tr>
            </tbody></table>
        </ConfirmModal>
    </div>
</template>
