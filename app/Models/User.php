<?php

namespace App\Models;

// 이메일 인증(MustVerifyEmail)과 비밀번호 재설정 메일은 메일 인프라가 없어 1단계 미구현.
// 확장 시: MustVerifyEmail 구현 + password_reset_tokens 테이블(기존) + 알림 라우트 추가.
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

// role/banned_at/is_guest/level/exp 는 mass assignment 대상에서 제외 (권한 상승 방지)
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'banned_at' => 'datetime',
            'is_guest' => 'boolean',
        ];
    }
}
