<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** 기존 정식 계정에 관리자 권한 부여/회수. 비밀번호·토큰은 다루지 않고 출력하지 않는다(계정 생성은 game:make-admin). audit_logs 에 기록. */
class AdminGrant extends Command
{
    protected $signature = 'admin:grant {email : 권한을 줄 정식(비게스트) 계정 이메일}';

    protected $description = '기존 계정에 관리자(role=admin) 권한 부여(audit 기록)';

    public function handle(): int
    {
        return AdminRevoke::setRole($this, (string) $this->argument('email'), 'admin');
    }
}
