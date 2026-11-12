import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        tailwindcss(),
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
        }),
        vue({
            template: { transformAssetUrls: { base: null, includeAbsolute: false } },
        }),
    ],
    // Babylon 딥 임포트를 사전 번들링해 콜드 스타트 시 재최적화/청크 폭증 완화
    optimizeDeps: {
        include: [
            'vue', 'vue-router', 'pinia',
            '@babylonjs/core/Engines/engine',
            '@babylonjs/core/scene',
            '@babylonjs/core/Cameras/arcRotateCamera',
            '@babylonjs/core/Lights/hemisphericLight',
            '@babylonjs/core/Lights/directionalLight',
            '@babylonjs/core/Maths/math.vector',
            '@babylonjs/core/Maths/math.color',
            '@babylonjs/core/Loading/sceneLoader',
            '@babylonjs/loaders/glTF',
        ],
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: true,
        // localhost(IPv6/IPv4) 해석 지연 회피: hot URL/HMR을 127.0.0.1로 고정
        origin: 'http://127.0.0.1:5173',
        hmr: { host: '127.0.0.1' },
        // server.origin을 지정하면 laravel-vite-plugin이 cors.origin을 그 값(5173)으로만 설정하므로
        // 개발 서버 한정으로 localhost/127.0.0.1/[::1]의 모든 포트를 명시 허용
        cors: { origin: /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/ },
        // Windows 볼륨 마운트는 inotify 이벤트가 전달되지 않아 polling 필요.
        // 대용량 정적 자산·빌드 산출물·백엔드 디렉터리는 감시 제외(polling 부하/지연 원인)
        watch: {
            usePolling: true,
            interval: 300,
            binaryInterval: 3000,
            ignored: [
                '**/public/assets/**',
                '**/public/build*/**',
                '**/public/images/**',
                '**/public/models/**',
                '**/public/hot',
                '**/vendor/**',
                '**/storage/**',
                '**/database/**',
                '**/docker/**',
                '**/node_modules/**',
                '**/*.bak*',
                '**/docs/**',
                '**/tests/**',
            ],
        },
    },
});
