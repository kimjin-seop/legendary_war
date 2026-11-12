<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/** 관리자 계정 생성/승격 전용 커맨드. 비밀번호는 숨김 프롬프트로만 입력(인자/로그/히스토리 미사용). */
class GameMakeAdmin extends Command
{
    protected $signature = 'game:make-admin {email} {--name=Admin}';

    protected $description = '관리자 계정 생성(신규) 또는 기존 계정 승격';

    public function handle(): int
    {
        $email = $this->argument('email');
        if (Validator::make(['email' => $email], ['email' => 'required|email'])->fails()) {
            $this->error('이메일 형식이 올바르지 않습니다.');

            return self::FAILURE;
        }
        $user = User::where('email', $email)->first();
        if ($user && $user->is_guest) {
            $this->error('게스트 계정은 승격할 수 없습니다.');

            return self::FAILURE;
        }
        if (! $user) {
            $pw = $this->secret('비밀번호 (8자 이상, 영문+숫자)');
            if ($pw !== $this->secret('비밀번호 확인')) {
                $this->error('비밀번호가 일치하지 않습니다.');

                return self::FAILURE;
            }
            $v = Validator::make(['password' => $pw], ['password' => ['required', Password::min(8)->letters()->numbers()]]);
            if ($v->fails()) {
                $this->error($v->errors()->first());

                return self::FAILURE;
            }
            $user = User::create(['name' => $this->option('name'), 'email' => $email, 'password' => $pw]);
        }
        $user->forceFill(['role' => 'admin'])->save();
        DB::table('audit_logs')->insert(['user_id' => null, 'action' => 'make_admin', 'entity' => 'users', 'entity_key' => (string) $user->id, 'after' => json_encode(['role' => 'admin']), 'created_at' => now()]);
        $this->info("관리자 설정 완료: user_id={$user->id}");

        return self::SUCCESS;
    }
}
