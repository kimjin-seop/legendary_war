<script setup>
// 감사 로그: 필터(관리자 actor·action·entity·기간)·페이지네이션, 전후값 펼쳐 보기
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { adminApi, errText, fmtTime, pretty } from '../../admin/adminApi.js';
import Pager from '../../admin/components/Pager.vue';

const route = useRoute();
const f = reactive({ actor: '', action: '', entity: String(route.query.entity ?? ''), from: '', to: '' });
const page = ref(null); const err = ref(''); const loading = ref(false); const open = ref(null);
async function load(p = 1) {
    loading.value = true; err.value = '';
    const q = { page: p, per_page: 50 };
    Object.entries(f).forEach(([k, v]) => { if (v !== '') q[k] = v; });
    try { page.value = await adminApi.audit(q); } catch (e) { err.value = errText(e); } finally { loading.value = false; }
}
onMounted(() => load());
</script>

<template>
    <div>
        <h1>감사 로그</h1>
        <form class="adm-row" @submit.prevent="load(1)">
            <input v-model="f.actor" placeholder="관리자 ID" style="width: 100px" />
            <input v-model="f.action" placeholder="동작(update·ban…)" />
            <input v-model="f.entity" placeholder="대상(heroes·users…)" />
            <input v-model="f.from" type="date" /> ~ <input v-model="f.to" type="date" />
            <button class="primary" type="submit" :disabled="loading">조회</button>
        </form>
        <div v-if="err" class="err">{{ err }}</div>
        <div class="adm-card adm-table-wrap">
            <table><tbody>
                <tr><th>ID</th><th>시각</th><th>관리자</th><th>동작</th><th>대상</th><th>사유</th><th></th></tr>
                <template v-for="a in page?.data ?? []" :key="a.id">
                    <tr :class="{ sel: open === a.id }">
                        <td>{{ a.id }}</td><td>{{ fmtTime(a.created_at) }}</td><td>{{ a.user_id ?? 'CLI' }}</td><td>{{ a.action }}</td><td>{{ a.entity }} #{{ a.entity_key ?? '-' }}</td>
                        <td>{{ (() => { try { const v = typeof a.after === 'string' ? JSON.parse(a.after) : a.after; return v?._reason ?? v?.reason ?? ''; } catch { return ''; } })() }}</td>
                        <td><button class="sm" @click="open = open === a.id ? null : a.id">{{ open === a.id ? '접기' : '전후값' }}</button></td>
                    </tr>
                    <tr v-if="open === a.id"><td colspan="7"><div class="adm-grid"><div><div class="muted">변경 전</div><pre>{{ pretty(a.before) || '-' }}</pre></div><div><div class="muted">변경 후</div><pre>{{ pretty(a.after) || '-' }}</pre></div></div></td></tr>
                </template>
                <tr v-if="page && !(page.data ?? []).length"><td colspan="7" class="muted">결과 없음</td></tr>
            </tbody></table>
            <Pager :page="page" @go="load" />
        </div>
    </div>
</template>
