// 관리자 진입 가드: /admin/* 는 role=admin 쿠키 세션만. 비로그인 = /admin/login, 로그인했지만 관리자 아님 = 홈('/')
import { ref } from 'vue';
import { adminMe } from './adminApi.js';

export const adminUser = ref(null);
let checked = false;
export function setAdminUser(u) { adminUser.value = u && u.role === 'admin' ? u : null; checked = true; }

export async function adminGuard(to) {
    if (!to.path.startsWith('/admin')) return true;
    if (to.path === '/admin/login') return true;
    if (!checked || !adminUser.value) {
        let u = null;
        try { u = await adminMe(); } catch { u = null; }
        if (!u) { checked = false; return { path: '/admin/login', query: { next: to.fullPath } }; }
        setAdminUser(u);
    }
    return adminUser.value ? true : { path: '/' };
}
