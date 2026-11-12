<?php

namespace App\Http\Controllers;

use App\Support\Period;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * 클라이언트 에러 리포트. POST /api/client-errors (인증 불필요, throttle:client-errors, 본문 8KB 상한).
 * 개인정보 미수집: 사용자 id·IP·쿠키 저장 안 함, URL 쿼리·해시 제거, 이메일·긴 토큰 형태 문자열은 마스킹.
 * 같은 fingerprint 는 하루(KST 05:00) 1행에 count 누적. 조회는 어드민(GET /api/admin/client-errors).
 */
class ClientErrorController extends Controller
{
    public const MAX_BODY = 8192;

    public function store(Request $request): JsonResponse
    {
        if (strlen((string) $request->getContent()) > self::MAX_BODY) {
            return response()->json(['error' => ['code' => 'payload_too_large', 'message' => '본문이 너무 큽니다.']], 413);
        }
        $v = $request->validate([
            'message' => ['required', 'string', 'max:1000'], 'stack' => ['sometimes', 'nullable', 'string', 'max:6000'], 'level' => ['sometimes', 'in:error,warn'],
            'scene' => ['sometimes', 'nullable', 'string', 'max:64'], 'url' => ['sometimes', 'nullable', 'string', 'max:500'], 'app_version' => ['sometimes', 'nullable', 'string', 'max:32'],
            'platform' => ['sometimes', 'nullable', 'string', 'max:64'],
        ]);
        $msg = mb_substr($this->scrub($v['message']), 0, 300);
        $stack = isset($v['stack']) ? mb_substr($this->scrub($v['stack']), 0, 2000) : null;
        $level = $v['level'] ?? 'error';
        $scene = isset($v['scene']) ? mb_substr($this->scrub($v['scene']), 0, 64) : null;
        $fp = sha1($level.'|'.$msg.'|'.strtok((string) $stack, "\n").'|'.$scene);
        $period = Period::dailyKey();
        $now = now();
        $n = DB::table('client_errors')->where(['period_key' => $period, 'fingerprint' => $fp])->update(['count' => DB::raw('count + 1'), 'last_seen_at' => $now]);
        if ($n === 0) {
            DB::table('client_errors')->insertOrIgnore(['period_key' => $period, 'fingerprint' => $fp, 'level' => $level, 'message' => $msg, 'stack' => $stack, 'scene' => $scene,
                'path' => isset($v['url']) ? mb_substr($this->scrub((string) (parse_url($v['url'], PHP_URL_PATH) ?: '')), 0, 120) : null, 'app_version' => isset($v['app_version']) ? mb_substr($this->scrub($v['app_version']), 0, 32) : null,
                'platform' => isset($v['platform']) ? mb_substr($this->scrub($v['platform']), 0, 64) : null, 'count' => 1, 'first_seen_at' => $now, 'last_seen_at' => $now]);
        }

        return response()->json(['ok' => true], 202);
    }

    /** GET /api/admin/client-errors[?q=&level=&from=&to=&min_count=&per_page=] 최근 발생 순 */
    public function index(Request $request): JsonResponse
    {
        $v = $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:64'], 'level' => ['sometimes', 'in:error,warn'], 'from' => ['sometimes', 'date'], 'to' => ['sometimes', 'date'],
            'min_count' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:200']]);
        $q = DB::table('client_errors')->orderByDesc('last_seen_at')->orderByDesc('id');
        ($v['q'] ?? '') !== '' && $q->where(fn ($w) => $w->where('message', 'like', '%'.addcslashes($v['q'], '%_\\').'%')->orWhere('scene', 'like', '%'.addcslashes($v['q'], '%_\\').'%'));
        isset($v['level']) && $q->where('level', $v['level']);
        isset($v['from']) && $q->where('last_seen_at', '>=', \Carbon\CarbonImmutable::parse($v['from'])->utc()->format('Y-m-d H:i:s'));
        isset($v['to']) && $q->where('last_seen_at', '<=', \Carbon\CarbonImmutable::parse($v['to'])->utc()->format('Y-m-d H:i:s'));
        isset($v['min_count']) && $q->where('count', '>=', (int) $v['min_count']);

        return response()->json($q->paginate((int) ($v['per_page'] ?? 50)));
    }

    /** 이메일(%40 인코딩 포함)·JWT·Bearer/긴 토큰·token|password|secret|key|auth=값·쿼리스트링·#fragment 마스킹(개인정보·비밀값이 로그에 남지 않게) */
    private function scrub(string $s): string
    {
        $s = preg_replace('/[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i', '[email]', $s) ?? $s;
        $s = preg_replace('/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/', '[jwt]', $s) ?? $s;
        $s = preg_replace('/(Bearer\s+)[A-Za-z0-9._~+\/=-]+/i', '$1[token]', $s) ?? $s;
        $s = preg_replace('/\b((?:access_|refresh_|api_|auth_)?(?:token|password|passwd|secret|key|auth))=[^\s&)"\']*/i', '$1=[redacted]', $s) ?? $s;
        $s = preg_replace('/\b[A-Fa-f0-9]{32,}\b|\b[A-Za-z0-9_-]{40,}\b/', '[token]', $s) ?? $s;
        $s = preg_replace('/\?[^\s)"\']*/', '?[q]', $s) ?? $s;
        $s = preg_replace('/#[^\s)"\']*/', '#[f]', $s) ?? $s;

        return $s;
    }
}
