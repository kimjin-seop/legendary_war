<script setup>
// 채팅 신고 큐: 미처리/전체 탭, 메시지 원문 스냅샷, 처리(기각·해결)·메시지 삭제·제재(분+사유)·제재 해제(사유). 처리 후 감사 로그 링크
import { onMounted, ref } from 'vue';
import { adminApi, errText, fmtTime } from '../../admin/adminApi.js';
import Pager from '../../admin/components/Pager.vue';
import ConfirmModal from '../../admin/components/ConfirmModal.vue';

const REASON = { abuse: '욕설·비방', spam: '도배', sexual: '음란', other: '기타' };
const ACTION = { dismissed: '기각', resolved: '해결', deleted: '삭제됨', sanctioned: '제재됨' };
const tab = ref('open');
const page = ref(null); const err = ref(''); const ok = ref(''); const loading = ref(false);
const modal = ref(null); const mBusy = ref(false); const mErr = ref(''); const minutes = ref(60); const note = ref('');
async function load(p = 1) {
    loading.value = true; err.value = '';
    try { page.value = await adminApi.reports({ status: tab.value, page: p }); } catch (e) { err.value = errText(e); } finally { loading.value = false; }
}
function setTab(t) { tab.value = t; load(1); }
function ask(kind, r) { modal.value = { kind, r }; mErr.value = ''; note.value = ''; minutes.value = 60; }
const TITLES = { dismissed: '신고 기각', resolved: '신고 해결', delete: '메시지 삭제', restrict: '채팅 제재', unrestrict: '제재 해제' };
async function run({ reason }) {
    const { kind, r } = modal.value; mBusy.value = true; mErr.value = '';
    try {
        if (kind === 'dismissed' || kind === 'resolved') await adminApi.handleReport(r.id, kind, note.value.trim() || undefined);
        else if (kind === 'delete') await adminApi.deleteMessage(r.message_id);
        else if (kind === 'restrict') await adminApi.restrict(r.target_user_id, Number(minutes.value), reason);
        else if (kind === 'unrestrict') await adminApi.unrestrict(r.target_user_id, reason);
        ok.value = `${TITLES[kind]} 완료 (신고 #${r.id})`;
        modal.value = null; load(page.value?.current_page ?? 1);
    } catch (e) { mErr.value = errText(e); } finally { mBusy.value = false; }
}
const restricted = (r) => r.target_restricted_until && Date.parse(String(r.target_restricted_until).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(r.target_restricted_until) ? '' : 'Z')) > Date.now();
onMounted(() => load());
</script>

<template>
    <div>
        <h1>채팅 신고</h1>
        <div class="tabs"><button :class="{ on: tab === 'open' }" @click="setTab('open')">미처리</button><button :class="{ on: tab === 'all' }" @click="setTab('all')">전체</button><button :disabled="loading" @click="load(page?.current_page ?? 1)">새로고침</button></div>
        <div v-if="err" class="err">{{ err }}</div>
        <div v-if="ok" class="okmsg">{{ ok }} · <RouterLink to="/admin/audit">감사 로그 보기</RouterLink></div>
        <div class="adm-card adm-table-wrap">
            <table><tbody>
                <tr><th>ID</th><th>신고 시각</th><th>사유</th><th>메시지 원문</th><th>대상</th><th>신고자</th><th>방</th><th>상태</th><th>처리</th></tr>
                <tr v-for="r in page?.data ?? []" :key="r.id">
                    <td>{{ r.id }}</td><td>{{ fmtTime(r.created_at) }}</td><td>{{ REASON[r.reason] ?? r.reason }}</td>
                    <td style="max-width: 280px; word-break: break-all">{{ r.body }} <span v-if="r.message_deleted_at" class="tag bad">삭제됨</span></td>
                    <td>{{ r.target_name ?? '-' }} <span class="muted">#{{ r.target_user_id }}</span><div v-if="restricted(r)" class="tag bad">제재 ~{{ fmtTime(r.target_restricted_until) }}</div></td>
                    <td>{{ r.reporter_name ?? '-' }} <span class="muted">#{{ r.reporter_user_id }}</span></td>
                    <td class="mono">{{ r.room_code ?? '-' }}</td>
                    <td><span v-if="r.handled_at" class="tag">{{ ACTION[r.handled_action] ?? r.handled_action }} {{ fmtTime(r.handled_at) }}</span><span v-else class="tag on">미처리</span></td>
                    <td style="white-space: nowrap">
                        <button class="sm" :disabled="!!r.handled_at" @click="ask('dismissed', r)">기각</button>
                        <button class="sm" :disabled="!!r.handled_at" @click="ask('resolved', r)">해결</button>
                        <button class="sm danger" :disabled="!!r.message_deleted_at" @click="ask('delete', r)">삭제</button>
                        <button class="sm danger" @click="ask('restrict', r)">제재</button>
                        <button class="sm" :disabled="!restricted(r)" @click="ask('unrestrict', r)">해제</button>
                    </td>
                </tr>
                <tr v-if="page && !(page.data ?? []).length"><td colspan="9" class="muted">{{ tab === 'open' ? '미처리 신고가 없습니다.' : '신고가 없습니다.' }}</td></tr>
            </tbody></table>
            <Pager :page="page" @go="load" />
        </div>
        <ConfirmModal v-if="modal" :title="TITLES[modal.kind]" :message="`신고 #${modal.r.id} · 대상 ${modal.r.target_name ?? ''}(#${modal.r.target_user_id})\n원문: ${modal.r.body ?? ''}`"
            :need-reason="modal.kind === 'restrict' || modal.kind === 'unrestrict'" :danger="modal.kind === 'delete' || modal.kind === 'restrict'" :busy="mBusy" :error="mErr" @cancel="modal = null" @ok="run">
            <template v-if="modal.kind === 'restrict'">
                <label class="f">제재 시간</label>
                <select v-model="minutes"><option :value="60">1시간</option><option :value="360">6시간</option><option :value="1440">1일</option><option :value="4320">3일</option><option :value="10080">7일</option><option :value="43200">30일</option></select>
            </template>
            <template v-if="modal.kind === 'dismissed' || modal.kind === 'resolved'">
                <label class="f">메모(선택)</label>
                <input v-model="note" maxlength="200" style="width: 100%; box-sizing: border-box" />
            </template>
        </ConfirmModal>
    </div>
</template>
