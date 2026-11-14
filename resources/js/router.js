import { createRouter, createWebHistory } from 'vue-router';
import { adminGuard } from './admin/adminGuard.js';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        // 운영 진입점 = 게임 메인(/battle)
        { path: '/', redirect: '/battle' },
        // Phaser 번들이 크므로 lazy import로 분리
        { path: '/battle', name: 'battle', component: () => import('./pages/Battle.vue') },
        // 관리자 화면(게임 Phaser 와 분리, 별도 청크). 가드: role=admin 쿠키 세션만(admin/adminGuard.js), 비로그인 = /admin/login, 비관리자 = 홈
        { path: '/admin/login', name: 'admin-login', component: () => import('./pages/admin/AdminLogin.vue') },
        {
            path: '/admin',
            component: () => import('./pages/admin/AdminLayout.vue'),
            children: [
                { path: '', name: 'admin', component: () => import('./pages/admin/AdminDashboard.vue') },
                { path: 'users', name: 'admin-users', component: () => import('./pages/admin/AdminUsers.vue') },
                { path: 'battles', name: 'admin-battles', component: () => import('./pages/admin/AdminBattles.vue') },
                { path: 'chat', name: 'admin-chat', component: () => import('./pages/admin/AdminChat.vue') },
                { path: 'war', name: 'admin-war', component: () => import('./pages/admin/AdminWar.vue') },
                { path: 'config', name: 'admin-config', component: () => import('./pages/admin/AdminConfig.vue') },
                { path: 'audit', name: 'admin-audit', component: () => import('./pages/admin/AdminAudit.vue') },
                { path: 'notice', name: 'admin-notice', component: () => import('./pages/admin/AdminNotice.vue') },
                { path: 'exchange', name: 'admin-exchange', component: () => import('./pages/admin/AdminExchange.vue') },
            ],
        },
        // 알 수 없는 경로는 게임 메인으로(/admin/* 는 위 라우트·가드가 먼저 처리)
        { path: '/:pathMatch(.*)*', redirect: '/battle' },
    ],
});
router.beforeEach(adminGuard);

export default router;
