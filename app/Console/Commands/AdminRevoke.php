<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** 관리자 권한 회수(role=user). 마지막 관리자는 회수할 수 없다. audit_logs 에 기록, 비밀번호·토큰 미취급. */
class AdminRevoke extends Command
{
    protected $signature = 'admin:revoke {email : 권한을 회수할 계정 이메일}';

    protected $description = '관리자(role=admin) 권한 회수(audit 기록, 마지막 관리자 보호)';

    public function handle(): int
    {
        return self::setRole($this, (string) $this->argument('email'), 'user');
    }

    /** admin:grant / admin:revoke 공용 */
    public static function setRole(Command $cmd, string $email, string $role): int
    {
        $user = User::where('email', $email)->first();
        if (! $user) {
            $cmd->error('해당 이메일의 계정이 없습니다.');

            return Command::FAILURE;
        }
        if ($user->is_guest) {
            $cmd->error('게스트 계정은 관리자로 지정할 수 없습니다.');

            return Command::FAILURE;
        }
        if ($user->role === $role) {
            $cmd->info("변경 없음: user_id={$user->id} 는 이미 role={$role}");

            return Command::SUCCESS;
        }
        if ($role === 'user' && User::where('role', 'admin')->count() <= 1) {
            $cmd->error('마지막 관리자는 회수할 수 없습니다.');

            return Command::FAILURE;
        }
        $before = $user->role;
        DB::transaction(function () use ($user, $role, $before) {
            $user->forceFill(['role' => $role])->save();
            DB::table('audit_logs')->insert(['user_id' => null, 'action' => $role === 'admin' ? 'admin_grant' : 'admin_revoke', 'entity' => 'users', 'entity_key' => (string) $user->id,
                'before' => json_encode(['role' => $before]), 'after' => json_encode(['role' => $role]), 'created_at' => now()]);
        });
        \Illuminate\Support\Facades\Schema::hasTable('personal_access_tokens') && DB::table('personal_access_tokens')->where('tokenable_id', $user->id)->where('tokenable_type', User::class)->delete();   // 권한 변경 시 기존 토큰 폐기
        $cmd->info("role={$role} 로 변경: user_id={$user->id}");

        return Command::SUCCESS;
    }
}
