<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 숨은 종장(ch999) 해금 판정. 서버가 요청 시 계산하며 DDL 이 없다.
 *  - 대상 집합 = shelf_map_meta.json 의 status=active 서가(chapter) + config game.hidden_chapter.main_chapters 의 스테이지 중
 *    필수(stages.rules.optional 이 true 가 아님)인 것 전부. 서가가 메타에 active 로 추가되면 자동으로 집합에 포함된다.
 *  - 전부 clear_count>0 이면 해금. 최초 해금 시 quest_event_log(event=chapter_unlock, ref=ch999)에 기록하여
 *    이후 서가가 늘어도 이미 연 유저는 유지한다.
 */
class HiddenChapterService
{
    public const EVENT = 'chapter_unlock';

    public static function chapter(): int
    {
        return (int) config('game.hidden_chapter.chapter', 999);
    }

    public static function ref(): string
    {
        return 'ch'.self::chapter();
    }

    /** @return int[] 대상 챕터 번호(메인 막 + active 서가 - 제외 목록 - 종장 자신) */
    public function targetChapters(): array
    {
        $cfg = (array) config('game.hidden_chapter');
        $chs = array_map('intval', (array) ($cfg['main_chapters'] ?? []));
        $file = (string) ($cfg['meta_path'] ?? base_path('database/data/shelf_map_meta.json'));
        $meta = is_file($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];
        foreach ((array) ($meta['shelves'] ?? []) as $sh) {
            if (($sh['status'] ?? null) === 'active' && isset($sh['chapter'])) {
                $chs[] = (int) $sh['chapter'];
            }
        }
        $chs = array_diff($chs, array_map('intval', (array) ($cfg['exclude_shelves'] ?? [])), [self::chapter()]);

        return array_values(array_unique($chs));
    }

    /** @return int[] 필수 스테이지 id(해당 챕터에 스테이지가 없으면 요구하지 않음) */
    public function requiredStageIds(): array
    {
        $rows = DB::table('stages')->whereIn('chapter', $this->targetChapters())->get(['id', 'rules']);

        return $rows->filter(fn ($r) => (json_decode((string) $r->rules, true)['optional'] ?? false) !== true)->pluck('id')->map(fn ($i) => (int) $i)->all();
    }

    /** 현재 클리어 상태만으로 계산(기록 무시) */
    public function computeCleared(User $user): bool
    {
        $ids = $this->requiredStageIds();
        if ($ids === []) {
            return false;   // 대상이 없으면 해금하지 않음(설정 오류 방어)
        }
        $cleared = DB::table('user_stage_progress')->where('user_id', $user->id)->whereIn('stage_id', $ids)->where('clear_count', '>', 0)->count();

        return $cleared >= count($ids);
    }

    /** 해금 여부. 계산이 true 면 최초 1회 기록(저장 실패해도 계산 결과는 반환) */
    public function unlocked(User $user): bool
    {
        $has = Schema::hasTable('quest_event_log');
        $where = ['user_id' => $user->id, 'event' => self::EVENT, 'ref' => self::ref()];
        if ($has && DB::table('quest_event_log')->where($where)->exists()) {
            return true;
        }
        if (! $this->computeCleared($user)) {
            return false;
        }
        if ($has) {
            DB::table('quest_event_log')->insertOrIgnore($where + ['created_at' => now()]);
        }

        return true;
    }

    /** 로비 표시용 진행도: {unlocked, cleared, total} */
    public function progress(User $user): array
    {
        $ids = $this->requiredStageIds();
        $cleared = $ids === [] ? 0 : DB::table('user_stage_progress')->where('user_id', $user->id)->whereIn('stage_id', $ids)->where('clear_count', '>', 0)->count();

        return ['unlocked' => $this->unlocked($user), 'cleared' => $cleared, 'total' => count($ids)];
    }
}
