<script setup>
// 전투 기록: 필터(상태·사용자·스테이지·기간)·페이지네이션, 행 선택 시 actions(행동 로그) 보기
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { adminApi, errText, fmtTime, pretty } from '../../admin/adminApi.js';
import Pager from '../../admin/components/Pager.vue';

const route = useRoute();
const f = reactive({ status: '', user_id: String(route.query.user_id ?? ''), stage_id: '', from: '', to: '' });
const page = ref(null); const err = ref(''); const loading = ref(false);
const sel = ref(null); const actions = ref([]); const aErr = ref(''); const aLoading = ref(false);
async function load(p = 1) {
    loading.value = true; err.value = '';
    const q = { page: p, per_page: 50 };
    Object.entries(f).forEach(([k, v]) => { if (v !== '') q[k] = v; });
    try { page.value = await adminApi.battles(q); } catch (e) { err.value = errText(e); } finally { loading.value = false; }
}
async function openActions(b) {
    if (sel.value?.id === b.id) { sel.value = null; return; }
    sel.value = b; actions.value = []; aErr.value = ''; aLoading.value = true;
    try { actions.value = (await adminApi.battleActions(b.id))?.actions ?? []; } catch (e) { aErr.value = errText(e); } finally { aLoading.value = false; }
}
onMounted(() => load());
</script>

<template>
    <div>
        <h1>전투 기록</h1>
        <form class="adm-row" @submit.prevent="load(1)">
            <select v-model="f.status"><option value="">상태 전체</option><option value="deployment">배치</option><option value="in_progress">진행</option><option value="finished">종료</option><option value="abandoned">포기</option></select>
            <input v-model="f.user_id" placeholder="사용자 ID" style="width: 100px" />
            <input v-model="f.stage_id" placeholder="스테이지 ID" style="width: 100px" />
            <input v-model="f.from" type="date" /> ~ <input v-model="f.to" type="date" />
            <button class="primary" type="submit" :disabled="loading">조회</button>
        </form>
        <div v-if="err" class="err">{{ err }}</div>
        <div class="adm-card adm-table-wrap">
            <table><tbody>
                <tr><th>ID</th><th>사용자</th><th>스테이지</th><th>상태</th><th>턴</th><th>승자</th><th>생성</th><th>정산</th><th></th></tr>
                <template v-for="b in page?.data ?? []" :key="b.id">
                    <tr :class="{ sel: sel?.id === b.id }">
                        <td>{{ b.id }}</td><td>{{ b.user_id ?? '-' }}</td><td>{{ b.stage_id ?? '-' }}</td><td><span class="tag">{{ b.status }}</span></td><td>{{ b.turn }}</td><td>{{ b.winner ?? '-' }}</td>
                        <td>{{ fmtTime(b.created_at) }}</td><td>{{ fmtTime(b.settled_at) }}</td>
                        <td><button class="sm" @click="openActions(b)">{{ sel?.id === b.id ? '닫기' : '행동 로그' }}</button></td>
                    </tr>
                    <tr v-if="sel?.id === b.id"><td colspan="9">
                        <div v-if="aLoading" class="muted">불러오는 중...</div>
                        <div v-else-if="aErr" class="err">{{ aErr }}</div>
                        <div v-else-if="!actions.length" class="muted">행동 기록 없음</div>
                        <table v-else><tbody><tr><th>seq</th><th>종류</th><th>시각</th><th>내용</th></tr>
                            <tr v-for="a in actions" :key="a.id ?? a.seq"><td>{{ a.seq }}</td><td>{{ a.type ?? a.action ?? '-' }}</td><td>{{ fmtTime(a.created_at) }}</td><td><pre style="max-height: 140px">{{ pretty(a.payload ?? a.data ?? a) }}</pre></td></tr>
                        </tbody></table>
                    </td></tr>
                </template>
                <tr v-if="page && !(page.data ?? []).length"><td colspan="9" class="muted">결과 없음</td></tr>
            </tbody></table>
            <Pager :page="page" @go="load" />
        </div>
    </div>
</template>
