<?php

namespace App\Http\Controllers;

use App\Game\IllegalAction;
use App\Models\User;
use App\Services\ProgressionService;
use App\Support\CharacterName;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function __construct(private readonly ProgressionService $progress)
    {
    }

    private function publicUser(User $u): array
    {
        $u->refresh();

        return ['id' => $u->id, 'name' => $u->name, 'email' => $u->is_guest ? null : $u->email, 'role' => $u->role, 'is_guest' => (bool) $u->is_guest];
    }

    private const NAME_MESSAGES = [
        'length' => '캐릭터명은 2~12자여야 합니다.',
        'invalid_chars' => '캐릭터명은 한글, 영문, 숫자만 사용할 수 있습니다.',
        'digits_only' => '숫자만으로 된 캐릭터명은 사용할 수 없습니다.',
        'forbidden' => '사용할 수 없는 캐릭터명입니다.',
    ];

    private function assertName(string $name): void
    {
        if ($v = CharacterName::violation($name)) {
            throw new IllegalAction('name_'.$v, self::NAME_MESSAGES[$v]);
        }
    }

    /** 캐릭터명 중복/규칙 확인 (로그인 불필요, IP당 분당 30회) */
    public function checkName(Request $request): JsonResponse
    {
        $name = CharacterName::normalize((string) $request->query('name', ''));
        if ($v = CharacterName::violation($name)) {
            return response()->json(['available' => false, 'reason' => $v]);
        }
        $taken = DB::table('users')->where('name_normalized', CharacterName::key($name))->exists();

        return response()->json($taken ? ['available' => false, 'reason' => 'taken'] : ['available' => true, 'reason' => null]);
    }

    /**
     * 게스트 생성: 토큰은 이 응답에서만 평문 노출(DB에는 sha256 해시만 저장).
     * 표시명 = 닉네임 + '#' + 4자리 숫자(서버 부여). 회원 캐릭터명에는 '#'를 쓸 수 없어 사칭이 불가능하고,
     * 게스트는 유니크 대상에서 제외되어(name_normalized NULL) 이름 선점/열거/가입 경쟁이 없다.
     */
    public function guest(Request $request): JsonResponse
    {
        $data = $request->validate(['nickname' => ['required', 'string', 'max:64']]);
        $nick = CharacterName::normalize($data['nickname']);
        $this->assertName($nick);
        // IP당 일일 게스트 생성 상한(KST 05:00 기준). 원본 IP 대신 해시로 집계한다.
        if (! \App\Support\DailyCounter::tryIncrement('guest_ip:'.hash('sha256', (string) $request->ip()), (int) config('game.free_limits.guest_per_ip_daily'))) {
            throw new IllegalAction('guest_daily_limit', '오늘 이 네트워크에서 만들 수 있는 게스트 수를 초과했습니다.', 429);
        }
        $token = Str::random(48);
        $user = DB::transaction(function () use ($nick, $token) {
            $u = new User;
            $u->forceFill([
                'name' => $nick.'#'.str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT),
                'email' => 'guest-'.Str::uuid().'@'.config('game.guest_email_domain'),
                'password' => Str::random(40), 'is_guest' => true, 'role' => 'user',
            ])->save();
            DB::table('guests')->insert([
                'user_id' => $u->id, 'nickname' => $nick, 'token_hash' => hash('sha256', $token),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->progress->grantStarter($u);

            return $u;
        });

        return response()->json(['user' => $this->publicUser($user), 'guest_token' => $token], 201);
    }

    /**
     * 회원가입. X-Guest-Token이 유효한 게스트라면 같은 users 행을 승격(진행 데이터 이관, 기존 게스트 토큰은 삭제되어 무효).
     * 이메일 인증/비밀번호 재설정은 1단계 미구현. 이메일 존재 여부는 일반 메시지(email_taken)로만 안내한다.
     */
    public function register(Request $request): JsonResponse
    {
        $request->merge([
            'email' => mb_strtolower(trim((string) $request->input('email'))),
            'name' => CharacterName::normalize((string) $request->input('name')),
        ]);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:64'],
            'email' => ['required', 'email:rfc', 'max:190'],
            'password' => ['required', 'string', 'max:128', 'confirmed', Password::min(8)->letters()->numbers()],
            'terms_accepted' => ['required', 'accepted'],
        ]);
        $this->assertName($data['name']);
        if (strcasecmp($data['password'], $data['email']) === 0 || strcasecmp($data['password'], $data['name']) === 0) {
            throw new IllegalAction('password_same_as_identity', '비밀번호는 이메일이나 캐릭터명과 달라야 합니다.');
        }
        $key = CharacterName::key($data['name']);
        $generic = '가입할 수 없는 정보입니다.';
        try {
            $user = DB::transaction(function () use ($data, $request, $key, $generic) {
                $guestUser = null;
                if (is_string($t = $request->header('X-Guest-Token')) && $t !== '') {
                    $g = DB::table('guests')->where('token_hash', hash('sha256', $t))->first();
                    $guestUser = $g ? User::where('id', $g->user_id)->where('is_guest', true)->first() : null;
                }
                if (DB::table('users')->where('email', $data['email'])->exists()) {
                    throw new IllegalAction('email_taken', $generic);
                }
                if (DB::table('users')->where('name_normalized', $key)->exists()) {
                    throw new IllegalAction('name_taken', '이미 사용 중인 캐릭터명입니다.');
                }
                $fields = ['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password'], 'is_guest' => false,
                    'name_normalized' => $key, 'terms_accepted_at' => now()];
                if ($guestUser) {
                    $guestUser->forceFill($fields)->save();
                    DB::table('guests')->where('user_id', $guestUser->id)->delete();

                    return $guestUser;
                }
                $u = new User;
                $u->forceFill($fields + ['role' => 'user'])->save();
                $this->progress->grantStarter($u);

                return $u;
            });
        } catch (UniqueConstraintViolationException $e) {
            // 동시 가입 경쟁: DB 유니크 제약이 최종 방어선 (500 대신 422)
            throw str_contains($e->getMessage(), 'email')
                ? new IllegalAction('email_taken', $generic)
                : new IllegalAction('name_taken', '이미 사용 중인 캐릭터명입니다.');
        }

        return response()->json(['user' => $this->publicUser($user)], 201);
    }

    /** SPA 쿠키 로그인 (먼저 GET /sanctum/csrf-cookie 호출, 같은 출처 브라우저에서만 세션 사용 가능) */
    public function login(Request $request): JsonResponse
    {
        if (! $request->hasSession()) {
            throw new IllegalAction('session_unavailable', '세션을 사용할 수 없는 요청입니다. 허용된 출처의 브라우저에서 /sanctum/csrf-cookie를 먼저 호출한 뒤 로그인하세요.', 409);
        }
        $cred = $request->validate(['email' => ['required', 'email', 'max:190'], 'password' => ['required', 'string', 'max:128']]);
        $email = mb_strtolower(trim($cred['email']));
        $rl = 'login:'.$email.'|'.$request->ip();   // 이메일+IP 키 (IP 단위 throttle과 별개)
        if (RateLimiter::tooManyAttempts($rl, 5)) {
            throw new IllegalAction('too_many_attempts', '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.', 429);
        }
        $user = User::where('email', $email)->first();
        // 계정 존재 여부와 무관하게 항상 해시 비교(타이밍 차이로 계정 열거 방지)
        $ok = Hash::check($cred['password'], $user && ! $user->is_guest ? $user->password : '$2y$12$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG');
        if (! $user || $user->is_guest || ! $ok) {
            RateLimiter::hit($rl, 300);

            return response()->json(['error' => ['code' => 'invalid_credentials', 'message' => '이메일 또는 비밀번호가 올바르지 않습니다.']], 422);
        }
        if ($user->banned_at) {
            return response()->json(['error' => ['code' => 'account_banned', 'message' => '정지된 계정입니다.']], 403);
        }
        RateLimiter::clear($rl);
        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return response()->json(['user' => $this->publicUser($user)]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->publicUser($request->user())]);
    }
}
