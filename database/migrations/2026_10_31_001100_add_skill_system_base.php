<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 스킬 시스템 1단계 기반(R0): skills 메타 컬럼 + 영웅당 복수 스킬(hero_skills). heroes.skill_id(대표 스킬)는 호환을 위해 유지한다.
 * backfill: 기존 skills 행에 database/data/skill_templates.json(migration_examples)의 메타를 채우고, heroes.skill_id -> hero_skills(sort_order 0).
 * down: hero_skills 삭제 + skills 신규 컬럼 삭제. 대표 스킬(heroes.skill_id)은 유지되나 복수 스킬 연결(sort_order>0)과 skills 메타는 손실된다.
 */
return new class extends Migration
{
    private const COLS = ['template', 'tags', 'evidence_level', 'source', 'is_invented', 'rarity_min', 'fx_key', 'flavor', 'enabled'];

    public function up(): void
    {
        Schema::table('skills', function (Blueprint $table) {
            if (! Schema::hasColumn('skills', 'template')) {
                $table->string('template', 32)->nullable();          // skill_templates.json 템플릿 id
                $table->json('tags')->nullable();                    // tag_list 중 최대 3
                $table->string('evidence_level', 16)->nullable();    // confirmed|accepted|disputed|legendary|invented|unreviewed
                $table->string('source')->nullable();
                $table->boolean('is_invented')->default(false);
                $table->string('rarity_min', 1)->nullable();         // C|B|A|S
                $table->string('fx_key', 48)->nullable();
                $table->string('flavor')->nullable();
                $table->boolean('enabled')->default(true);           // false=예비/보류(엔진 미적용)
            }
        });
        if (! Schema::hasTable('hero_skills')) {
            Schema::create('hero_skills', function (Blueprint $table) {
                $table->id();
                $table->foreignId('hero_id')->constrained('heroes')->cascadeOnDelete();
                $table->foreignId('skill_id')->constrained('skills')->cascadeOnDelete();
                $table->unsignedTinyInteger('sort_order')->default(0);
                $table->timestamps();
                $table->unique(['hero_id', 'skill_id']);
                $table->index(['hero_id', 'sort_order']);
            });
        }
        $path = database_path('data/skill_templates.json');
        if (is_file($path)) {
            $now = now();
            foreach (json_decode(file_get_contents($path), true)['migration_examples'] ?? [] as $s) {
                DB::table('skills')->where('code', $s['code'])->whereNull('template')->update([
                    'template' => $s['template'] ?? null, 'tags' => json_encode($s['tags'] ?? []), 'evidence_level' => $s['evidence_level'] ?? null,
                    'source' => $s['source'] ?? null, 'is_invented' => ! empty($s['is_invented']) ? 1 : 0, 'rarity_min' => $s['rarity_min'] ?? null,
                    'fx_key' => $s['fx_key'] ?? null, 'flavor' => $s['flavor'] ?? null, 'enabled' => ($s['enabled'] ?? true) ? 1 : 0, 'updated_at' => $now,
                ]);
            }
        }
        $now = now();
        foreach (DB::table('heroes')->whereNotNull('skill_id')->get(['id', 'skill_id']) as $h) {
            DB::table('hero_skills')->insertOrIgnore(['hero_id' => $h->id, 'skill_id' => $h->skill_id, 'sort_order' => 0, 'created_at' => $now, 'updated_at' => $now]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('hero_skills');
        Schema::table('skills', function (Blueprint $table) {
            $cols = array_values(array_filter(self::COLS, fn ($c) => Schema::hasColumn('skills', $c)));
            if ($cols) {
                $table->dropColumn($cols);
            }
        });
    }
};
