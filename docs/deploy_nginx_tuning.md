# nginx 압축·캐시 튜닝 예시 (2026-11-14 성능 1단계, 문서만 — 서버 설정은 변경하지 않음)

적용은 운영 인프라 변경이므로 사용자 승인 후에 한다(AGENTS.md 4절). 아래는 예시이며 실제 server 블록·경로에 맞춰 조정한다.

## 목적
- `public/build/*`(Vite 해시 파일명)·`public/assets/*`(`?v=ASSET_VERSION` 캐시 버스팅)는 장기 캐시 + immutable → 재방문 시 다운로드 0.
- manifest·JSON 데이터는 짧은 캐시 + ETag 재검증 → 배포 직후 새 목록이 바로 보임.
- `/sw.js`(PWA 서비스 워커)는 항상 재검증(no-cache) → 서비스 워커 갱신이 막히지 않게.
- 텍스트 계열(JS/CSS/JSON/SVG)은 gzip(+가능하면 brotli) 압축. 이미지(webp/png/jpg)·오디오(opus/mp3)는 이미 압축돼 있어 제외.
- 이 설정이 확인되면 FE 로비 예열을 켠다: `resources/js/game/assets.js` 의 `WARM_DEFAULT = true`.

## 예시

```nginx
# --- 압축 ---
gzip on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_vary on;
gzip_proxied any;
gzip_types text/plain text/css application/javascript application/json image/svg+xml application/manifest+json;

# brotli 모듈(ngx_brotli)이 있을 때만
# brotli on;
# brotli_comp_level 5;
# brotli_types text/plain text/css application/javascript application/json image/svg+xml application/manifest+json;

# --- Vite 빌드 산출물(파일명에 해시) : 1년 + immutable ---
location ^~ /build/ {
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files $uri =404;            # 없는 파일에 SPA HTML(200)을 주지 않는다
}

# --- 서비스 워커 : 항상 재검증 ---
location = /sw.js {
    add_header Cache-Control "no-cache" always;
    try_files $uri =404;
}
location = /manifest.webmanifest {
    add_header Cache-Control "no-cache" always;
    try_files $uri =404;
}

# --- 에셋 manifest·JSON 데이터 : 짧은 캐시 + ETag(nginx 정적 파일 기본 on) ---
location ~* ^/assets/.+\.json$ {
    etag on;
    add_header Cache-Control "public, max-age=60, must-revalidate" always;
    try_files $uri =404;            # manifest.runtime.json 이 없으면 404 -> FE 가 manifest.json 으로 폴백
}

# --- 이미지·오디오 에셋 : URL 에 ?v=ASSET_VERSION 이 붙으므로 장기 캐시 ---
# 주의: 같은 파일명 덮어쓰기 교체 후에는 반드시 resources/js/game/assetVersion.js 의 ASSET_VERSION 을 올려야 한다.
location ^~ /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files $uri =404;
}
```

## 확인 방법
```sh
curl -sI https://<host>/build/assets/<해시>.js | grep -i -E "cache-control|content-encoding"
curl -sI -H "Accept-Encoding: gzip" https://<host>/assets/manifest.runtime.json | grep -i -E "cache-control|etag|content-encoding"
curl -sI https://<host>/sw.js | grep -i cache-control
curl -sI https://<host>/assets/없는파일.png      # 404 여야 함(200 HTML 이면 try_files 확인)
```

## 주의
- `add_header` 는 하위 location 에 하나라도 있으면 상위 add_header 를 상속하지 않는다. 보안 헤더를 상위에 두었다면 각 location 에 다시 적는다.
- `/assets/` 장기 캐시는 '같은 파일명 내용 교체 + ASSET_VERSION 미변경'일 때 옛 파일이 1년 남는다. 교체 작업 절차에 버전 올리기를 포함한다.
- `manifest.runtime.json` 은 `node scripts/build_runtime_manifest.mjs` 로 manifest.json 을 바꿀 때마다 재생성한다(`--check` 로 최신 여부 확인).
