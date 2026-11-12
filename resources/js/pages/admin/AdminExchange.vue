<script setup>
// 일일 교환소 상품 관리(docs/SHOP_EXCHANGE_SPEC.md §1): 목록·등록·수정(삭제 없음, 사용 끄기). 변경 전후 미리보기 + 사유 입력(audit entity=exchange-products)
import { computed, onMounted, ref } from 'vue';
import { adminApi, errText, short } from '../../admin/adminApi.js';
import ConfirmModal from '../../admin/components/ConfirmModal.vue';

const KIND = { equipment: '장비', currency: '재화' };
const list = ref([]); const err = ref(''); const ok = ref('');
const sel = ref(null); const form = ref(null);
const confirmOpen = ref(false); const mBusy = ref(false); const mErr = ref('');
async function load() { try { list.value = (await adminApi.exchangeProducts())?.products ?? []; err.value = ''; } catch (e) { err.value = errText(e); } }
const blank = () => ({ code: '', name_ko: '', description: '', kind: 'equipment', payload: '{\n  "equipment_code": ""\n}', price_gold: 0, price_currency: 'gold', daily_limit: 1, enabled: true, sort_order: 0 });
function newOne() { sel.value = null; form.value = blank(); ok.value = ''; }
function pick(p) {
    sel.value = p; ok.value = '';
    let pl = p.payload; try { pl = JSON.stringify(typeof pl === 'string' ? JSON.parse(pl) : pl, null, 2); } catch { pl = String(pl ?? ''); }
    form.value = { code: p.code, name_ko: p.name_ko ?? p.name ?? '', description: p.description ?? '', kind: p.kind, payload: pl, price_gold: p.price_gold, price_currency: p.price_currency ?? 'gold', daily_limit: p.daily_limit, enabled: !!p.enabled, sort_order: p.sort_order ?? 0 };
}
const parsed = computed(() => {
    const f = form.value; if (!f) return { bad: '폼 없음' };
    let payload; try { payload = JSON.parse(f.payload); } catch { return { bad: 'payload JSON 형식 오류' }; }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { bad: 'payload 는 JSON 객체' };
    if (!sel.value && !/^[a-z0-9_]{2,40}$/.test(f.code)) return { bad: '코드는 영소문자·숫자·밑줄 2~40자' };
    if (!f.name_ko.trim()) return { bad: '이름 필수' };
    const body = { name_ko: f.name_ko.trim(), description: f.description.trim() || null, kind: f.kind, payload, price_gold: Number(f.price_gold), price_currency: f.price_currency === 'pen' ? 'pen' : 'gold', daily_limit: Number(f.daily_limit), enabled: !!f.enabled, sort_order: Number(f.sort_order) };
    if (![body.price_gold, body.daily_limit, body.sort_order].every(Number.isInteger)) return { bad: '가격·한도·정렬은 정수' };
    if (!sel.value) return { body: { code: f.code, ...body }, changes: Object.entries(body).map(([k, v]) => ({ k, before: null, after: v })) };
    const changes = []; const patch = {};
    Object.entries(body).forEach(([k, v]) => { let b = sel.value[k]; if (k === 'payload') { try { b = typeof b === 'string' ? JSON.parse(b) : b; } catch { /* 그대로 */ } } if (k === 'enabled') b = !!b; if (k === 'price_currency') b = b ?? 'gold'; if (k === 'name_ko') b = sel.value.name_ko ?? sel.value.name; if (JSON.stringify(b ?? null) !== JSON.stringify(v ?? null)) { changes.push({ k, before: b, after: v }); patch[k] = v; } });
    return { body: patch, changes };
});
async function save({ reason }) {
    mBusy.value = true; mErr.value = '';
    try {
        if (sel.value) await adminApi.updateExchangeProduct(sel.value.id, { ...parsed.value.body, reason });
        else await adminApi.createExchangeProduct({ ...parsed.value.body, reason });
        ok.value = `상품 ${sel.value ? `#${sel.value.id} 수정` : '등록'} 완료`; confirmOpen.value = false; form.value = null; sel.value = null; load();
    } catch (e) { mErr.value = errText(e); } finally { mBusy.value = false; }
}
const fmtV = (v) => (v == null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v));
onMounted(load);
</script>

<template>
    <div>
        <div class="adm-row"><h1 class="grow">교환소 상품</h1><button class="primary" @click="newOne">새 상품</button></div>
        <div v-if="err" class="err">{{ err }}</div>
        <div v-if="ok" class="okmsg">{{ ok }} · <RouterLink :to="{ path: '/admin/audit', query: { entity: 'exchange-products' } }">감사 로그 보기</RouterLink></div>
        <div class="adm-grid" style="grid-template-columns: minmax(300px, 1.2fr) minmax(280px, 1fr)">
            <div class="adm-card adm-table-wrap">
                <table><tbody>
                    <tr><th>ID</th><th>코드</th><th>이름</th><th>종류</th><th>가격</th><th>결제</th><th>일일</th><th>사용</th></tr>
                    <tr v-for="p in list" :key="p.id" :class="{ sel: sel?.id === p.id }" style="cursor: pointer" @click="pick(p)">
                        <td>{{ p.id }}</td><td class="mono">{{ p.code }}</td><td>{{ p.name_ko ?? p.name }}</td><td>{{ KIND[p.kind] ?? p.kind }}</td><td>{{ p.price_gold }}</td><td>{{ p.price_currency === 'pen' ? '펜' : '골드' }}</td><td>{{ p.daily_limit || '무제한' }}</td>
                        <td><span class="tag" :class="p.enabled ? 'on' : ''">{{ p.enabled ? '사용' : '꺼짐' }}</span></td>
                    </tr>
                    <tr v-if="!list.length"><td colspan="8" class="muted">상품 없음</td></tr>
                </tbody></table>
            </div>
            <div class="adm-card">
                <div v-if="!form" class="muted">상품을 선택하거나 [새 상품]을 누르세요.</div>
                <template v-else>
                    <h3>{{ sel ? `상품 #${sel.id} 수정` : '새 상품' }}</h3>
                    <label class="f">코드(등록 후 변경 불가)</label><input v-model="form.code" class="mono" :disabled="!!sel" />
                    <label class="f">이름</label><input v-model="form.name_ko" maxlength="64" style="width: 100%; box-sizing: border-box" />
                    <label class="f">설명</label><input v-model="form.description" maxlength="255" style="width: 100%; box-sizing: border-box" />
                    <label class="f">종류</label><select v-model="form.kind"><option value="equipment">장비(payload.equipment_code)</option><option value="currency">재화(payload.currency, amount)</option></select>
                    <label class="f">payload (JSON 객체)</label><textarea v-model="form.payload" />
                    <div class="adm-row" style="margin-top: 8px">
                        <label class="muted">가격 <input v-model.number="form.price_gold" type="number" min="0" style="width: 110px" /></label>
                        <label class="muted">결제 <select v-model="form.price_currency"><option value="gold">골드</option><option value="pen">펜</option></select></label>
                        <label class="muted">일일 한도(0=무제한) <input v-model.number="form.daily_limit" type="number" min="0" style="width: 80px" /></label>
                        <label class="muted">정렬 <input v-model.number="form.sort_order" type="number" min="0" style="width: 70px" /></label>
                        <label><input v-model="form.enabled" type="checkbox" /> 사용</label>
                    </div>
                    <div v-if="parsed.bad" class="err">{{ parsed.bad }}</div>
                    <div class="adm-row"><span class="grow" /><button @click="form = null; sel = null">취소</button><button class="primary" :disabled="!!parsed.bad || !parsed.changes?.length" @click="confirmOpen = true; mErr = ''">저장...</button></div>
                </template>
            </div>
        </div>
        <ConfirmModal v-if="confirmOpen" :title="sel ? `상품 #${sel.id} 저장` : '상품 등록'" need-reason ok-label="저장" :busy="mBusy" :error="mErr" @cancel="confirmOpen = false" @ok="save">
            <table class="diff"><tbody><tr><th>필드</th><th>전</th><th>후</th></tr>
                <tr v-for="c in parsed.changes" :key="c.k"><td>{{ c.k }}</td><td class="b mono">{{ short(fmtV(c.before), 60) }}</td><td class="a mono">{{ short(fmtV(c.after), 60) }}</td></tr>
            </tbody></table>
        </ConfirmModal>
    </div>
</template>
