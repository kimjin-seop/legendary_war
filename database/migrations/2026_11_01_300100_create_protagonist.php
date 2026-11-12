<?php

use App\Services\ProtagonistService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 오리지널 주인공(캠페인 전용 영웅).
 * - heroes.campaign_only(멀티·가챠·전체 영웅 목록 제외 대상), heroes.is_protagonist(엔진이 @protagonist=항상 지휘관으로 해석할 표식). 둘 다 기본 false.
 * - user_protagonists: 유저당 1행(성별·초상화 face·클래스·선택 방식·검사 답안·재검사 횟수). 주인공 영웅 보유는 user_heroes 1행(원형 hero_id)이며
 *   재검사 시 같은 user_heroes 행의 hero_id만 교체(레벨·경험치·장비·편성 유지).
 * - 원형 영웅 10행(protagonist_{male|female}_{sword|spear|archer|cavalry|heavy})은 ProtagonistService::seedArchetypes()가 멱등 삽입
 *   (unit_types/skills가 이미 시드된 DB에서만 삽입됨. 빈 DB는 game:seed 후 `php artisan game:seed-protagonist`).
 * down: 원형 영웅 행(보유 중이면 user_heroes 포함)·user_protagonists·컬럼 삭제.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('heroes', function (Blueprint $table) {
            if (! Schema::hasColumn('heroes', 'campaign_only')) {
                $table->boolean('campaign_only')->default(false);
            }
            if (! Schema::hasColumn('heroes', 'is_protagonist')) {
                $table->boolean('is_protagonist')->default(false);
            }
        });

        if (! Schema::hasTable('user_protagonists')) {
            Schema::create('user_protagonists', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
                $table->string('gender', 8);
                $table->string('face', 16);            // male_a|b|c, female_a|b|c
                $table->string('class', 16);           // sword|spear|archer|cavalry|heavy
                $table->string('source', 8);           // quiz|manual|skip(기본 원형)|auto(소급 자동 지급)
                $table->text('answers')->nullable();   // 검사 답안 JSON {문항id: 선택id}
                $table->text('scores')->nullable();    // 채점 결과 JSON {class: 점수}
                $table->unsignedInteger('retest_count')->default(0);
                $table->timestamps();
            });
        }

        app(ProtagonistService::class)->seedArchetypes();
    }

    public function down(): void
    {
        $ids = DB::table('heroes')->where('is_protagonist', true)->pluck('id');
        DB::table('user_heroes')->whereIn('hero_id', $ids)->delete();   // 보유 행이 있으면 FK restrict라 먼저 제거
        DB::table('hero_skills')->whereIn('hero_id', $ids)->delete();
        DB::table('heroes')->whereIn('id', $ids)->delete();
        Schema::dropIfExists('user_protagonists');
        Schema::table('heroes', function (Blueprint $table) {
            $table->dropColumn(['campaign_only', 'is_protagonist']);
        });
    }
};
