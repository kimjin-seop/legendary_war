<?php

namespace App\Game;

/** 불법 행동. code는 API 사유 코드, status는 권장 HTTP 상태. */
class IllegalAction extends \RuntimeException
{
    public function __construct(public readonly string $reason, string $message = '', public readonly int $status = 422, public readonly array $extra = [])
    {
        parent::__construct($message !== '' ? $message : $reason);
    }
}
