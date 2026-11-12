<script setup>
// 사용자 관리: 검색(이름·이메일, 서버 q)·필터(정지/게스트/역할)·페이지네이션, 정지/해제(사유 입력 → 감사 로그 after.reason)
import { onMounted, reactive, ref } from 'vue';
import { adminApi, errText, fmtTime } from '../../admin/adminApi.js';
import Pager from '../../admin/components/Pager.vue';
import ConfirmModal from '../../admin/components/ConfirmModal.vue';

const f = reactive({ q: '', banned: '', is_guest: '', role: '' });
const page = ref(null); const err = ref(''); const ok = ref(''); const loading = ref(false);
const pending = ref(null); const mBusy = ref(false); const mErr = ref('');
async function load(p = 1) {
    loading.value = true; err.value = '';
    const q = { page: p, per_page: 50 };
    Object.entries(f).forEach(([k, v]) => { if (v !== '') q[k] = v; });
    try { page.value = await adminApi.users(q); } catch (e) { err.value = errText(e); } finally { loading.value = false; }
}
function ask(u, ban) { pending.value = { u, ban }; mErr.value = ''; }
async function doIt({ reason }) {
    const { u, ban } = pending.value; mBusy.value = true; mErr.value = '';
    try { await (ban ? adminApi.ban(u.id, reason) : adminApi.unban(u.id, reason)); ok.value = `${u.name}(#${u.id}) ${ban ? '정지' : '정지 해제'} 완료`; pending.value = null; load(page.value?.current_page ?? 1); }
    catch (e) { mErr.value = errText(e); } finally { mBusy.value = false; }
}
onMounted(() => load());
</script>

<template>
    <div>
        <h1>사용자</h1>
        <form class="adm-row" @submit.prevent="load(1)">
            <input v-model="f.q" class="grow" placeholder="이름·이메일 검색" />
            <select v-model="f.banned"><option value="">정지 전체</option><option value="1">정지됨</option><option value="0">정상</option></select>
            <select v-model="f.is_guest"><option value="">계정 전체</option><option value="0">회원</option><option value="1">게스트</option></select>
            <select v-model="f.role"><option value="">역할 전체</option><option value="admin">관리자</option><option value="user">일반</option></select>
            <button class="primary" type="submit" :disabled="loading">검색</button>
        </form>
        <div v-if="err" class="err">{{ err }}</div>
        <div v-if="ok" class="okmsg">{{ ok }} · <RouterLink to="/admin/audit">감사 로그 보기</RouterLink></div>
        <div class="adm-card adm-table-wrap">
            <table><tbody>
                <tr><th>ID</th><th>이름</th><th>이메일</th><th>역할</th><th>레벨</th><th>가입</th><th>상태</th><th></th></tr>
                <tr v-for="u in page?.data ?? []" :key="u.id">
                    <td>{{ u.id }}</td><td>{{ u.name }}</td><td>{{ u.email ?? '-' }}</td>
                    <td><span class="tag" :class="u.role === 'admin' ? 'on' : ''">{{ u.role }}</span> <span v-if="u.is_guest" class="tag">게스트</span></td>
                    <td>{{ u.level }}</td><td>{{ fmtTime(u.created_at) }}</td>
                    <td><span v-if="u.banned_at" class="tag bad">정지 {{ fmtTime(u.banned_at) }}</span><span v-else class="muted">정상</span></td>
                    <td>
                        <button v-if="!u.banned_at" class="sm danger" :disabled="u.role === 'admin'" @click="ask(u, true)">정지</button>
                        <button v-else class="sm" @click="ask(u, false)">해제</button>
                        <RouterLink class="sm" :to="{ path: '/admin/battles', query: { user_id: u.id } }" style="margin-left: 6px">전투</RouterLink>
                    </td>
                </tr>
                <tr v-if="page && !(page.data ?? []).length"><td colspan="8" class="muted">결과 없음</td></tr>
            </tbody></table>
            <Pager :page="page" @go="load" />
        </div>
        <ConfirmModal v-if="pending" :title="pending.ban ? '사용자 정지' : '정지 해제'" :message="`${pending.u.name} (#${pending.u.id}${pending.u.email ? `, ${pending.u.email}` : ''})${pending.ban ? '\n정지하면 활성 세션이 즉시 끊깁니다.' : ''}`"
            need-reason :danger="pending.ban" :ok-label="pending.ban ? '정지' : '해제'" :busy="mBusy" :error="mErr" @cancel="pending = null" @ok="doIt" />
    </div>
</template>
