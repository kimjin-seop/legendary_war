<?php

namespace App\Console\Commands;

use Illuminate\Support\Facades\Cache;

use App\Support\FacingFlag;

use App\Models\User;
use App\Services\ProgressionService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * 개발/QA 전용 테스트 계정 생성(local/testing 환경에서만). 게스트 IP 일일 상한을 거치지 않는다.
 * 시작 영웅/골드/기본 편성이 지급된 게스트 사용자를 만들고 X-Guest-Token 자격증명을 파일로만 저장한다(출력하지 않음).
 */
class GameQaAccount extends Command
{
    protected $signature = 'game:qa-account
        {--out=storage/app/qa/account.json : 자격증명 JSON 저장 경로(프로젝트 상대 또는 절대)}
        {--nickname=QA계정 : 닉네임(뒤에 #4자리 부여)}
        {--unlock-stages : 모든 스테이지 해금(선행 클리어 기록 추가)}
        {--squad : 이 QA 사용자의 새 전투만 영웅-부대 소속(squad) 규칙 on(local/testing 한정)}
        {--facing : 이 QA 사용자의 새 전투만 방향(facing) 규칙 on(local/testing 한정, 서버 캐시 플래그)}
        {--alternate : 이 QA 사용자의 새 전투만 교대 행동(부대 단위) 규칙 on(local/testing 한정, 서버 캐시 플래그)}';

    protected $description = 'QA 전용 게스트 계정 생성(local/testing 한정, 자격증명은 파일로만 저장)';

    public function handle(ProgressionService $progress): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('local/testing 환경에서만 실행할 수 있습니다.');

            return self::FAILURE;
        }
        $token = Str::random(48);
        $user = DB::transaction(function () use ($token, $progress) {
            $u = new User;
            $u->forceFill([
                'name' => $this->option('nickname').'#'.str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT),
                'email' => 'guest-'.Str::uuid().'@'.config('game.guest_email_domain'),
                'password' => Str::random(40), 'is_guest' => true, 'role' => 'user',
            ])->save();
            DB::table('guests')->insert([
                'user_id' => $u->id, 'nickname' => $this->option('nickname'), 'token_hash' => hash('sha256', $token),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $progress->grantStarter($u);
            $this->option('facing') && Cache::forever(FacingFlag::key($u->id), 1);
            $this->option('squad') && Cache::forever(\App\Support\SquadFlag::key($u->id), 1);
            $this->option('alternate') && Cache::forever(\App\Support\AlternateFlag::key($u->id), 1);
            if ($this->option('unlock-stages')) {
                foreach (DB::table('stages')->pluck('id') as $sid) {
                    DB::table('user_stage_progress')->insertOrIgnore(['user_id' => $u->id, 'stage_id' => $sid, 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
                }
            }

            return $u;
        });
        $out = (string) $this->option('out');
        $path = preg_match('#^([A-Za-z]:|/)#', $out) ? $out : base_path($out);
        @mkdir(dirname($path), 0775, true);
        file_put_contents($path, json_encode([
            'user_id' => $user->id, 'name' => $user->name, 'header' => 'X-Guest-Token', 'guest_token' => $token,
            'note' => '개발 전용 QA 계정. 운영 사용 금지.',
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        $this->info("QA 계정 생성: user_id={$user->id} (자격증명은 파일에 저장: $path)");

        return self::SUCCESS;
    }
}
