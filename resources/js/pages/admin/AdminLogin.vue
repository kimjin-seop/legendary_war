<script setup>
// 관리자 로그인(기존 회원 로그인 API 재사용). 성공 + role=admin 이면 대시보드, 아니면 홈
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import '../../admin/admin.css';
import { adminLogin, errText } from '../../admin/adminApi.js';
import { setAdminUser } from '../../admin/adminGuard.js';

const router = useRouter();
const route = useRoute();
const email = ref('');
const password = ref('');
const busy = ref(false);
const err = ref('');
async function submit() {
    if (busy.value) return;
    busy.value = true; err.value = '';
    try {
        const u = await adminLogin(email.value.trim(), password.value);
        password.value = '';
        if (u?.role !== 'admin') { setAdminUser(null); err.value = '관리자 계정이 아닙니다.'; setTimeout(() => router.push('/'), 900); return; }
        setAdminUser(u);
        router.push(typeof route.query.next === 'string' && route.query.next.startsWith('/admin') ? route.query.next : '/admin');
    } catch (e) { err.value = errText(e); } finally { busy.value = false; }
}
</script>

<template>
    <div class="adm adm-login-wrap">
        <form class="adm-card adm-login" @submit.prevent="submit">
            <h1>관리자 로그인</h1>
            <p class="muted">게임 회원 계정으로 로그인합니다. 관리자 권한이 있는 계정만 들어갈 수 있습니다.</p>
            <label class="f">이메일</label>
            <input v-model="email" type="email" autocomplete="username" required />
            <label class="f">비밀번호</label>
            <input v-model="password" type="password" autocomplete="current-password" required />
            <div v-if="err" class="err">{{ err }}</div>
            <button class="primary" type="submit" :disabled="busy" style="width: 100%">{{ busy ? '확인 중...' : '로그인' }}</button>
        </form>
    </div>
</template>
