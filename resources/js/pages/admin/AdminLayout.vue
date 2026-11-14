<script setup>
// 관리자 화면 레이아웃: 사이드 메뉴 + 본문. 진입 가드는 router.js(beforeEach -> admin/adminGuard.js: role=admin 아니면 홈, 비로그인은 /admin/login)
import { useRouter, useRoute } from 'vue-router';
import '../../admin/admin.css';
import { adminLogout } from '../../admin/adminApi.js';
import { adminUser, setAdminUser } from '../../admin/adminGuard.js';

const router = useRouter();
const route = useRoute();
const MENU = [
    ['/admin', '대시보드'], ['/admin/users', '사용자'], ['/admin/battles', '전투 기록'], ['/admin/chat', '채팅 신고'],
    ['/admin/war', '시즌 전쟁'], ['/admin/config', '게임 데이터'], ['/admin/exchange', '교환소 상품'], ['/admin/notice', '공지·점검'], ['/admin/audit', '감사 로그'],
];
const active = (to) => (to === '/admin' ? route.path === '/admin' : route.path.startsWith(to));
async function logout() { await adminLogout(); setAdminUser(null); router.push('/'); }
</script>

<template>
    <div class="adm">
        <nav class="adm-side">
            <div class="brand">SRPG 관리자</div>
            <RouterLink v-for="[to, label] in MENU" :key="to" :to="to" :class="{ 'router-link-active': active(to) }" active-class="" exact-active-class="">{{ label }}</RouterLink>
            <div class="who">
                <div v-if="adminUser">{{ adminUser.name }} (관리자)</div>
                <button class="sm" style="margin-top: 6px" @click="logout">로그아웃</button>
                <a href="/battle"style="padding: 6px 0; display: inline-block; margin-left: 8px">게임으로</a>
            </div>
        </nav>
        <main class="adm-main"><RouterView /></main>
    </div>
</template>
