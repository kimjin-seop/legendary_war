<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class NameRulesTest extends TestCase
{
    use RefreshDatabase;

    private function register(string $name, string $email, array $extra = [])
    {
        return $this->postJson('/api/auth/register', array_merge(['name' => $name, 'email' => $email, 'password' => 'Passw0rd123', 'password_confirmation' => 'Passw0rd123', 'terms_accepted' => true], $extra));
    }

    public function test_중복_캐릭터명은_대소문자가_달라도_422_name_taken(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->register('Tester', 'a@example.com')->assertCreated();
        $this->register('tESTER', 'b@example.com')->assertStatus(422)->assertJsonPath('error.code', 'name_taken');
        $this->register('Other', ' A@Example.com ')->assertStatus(422)->assertJsonPath('error.code', 'email_taken');   // 이메일 정규화 후 중복
        $this->assertSame(1, DB::table('users')->count());
        $this->assertSame('tester', DB::table('users')->value('name_normalized'));
        // 동시 가입 경쟁: 사전 검사를 통과해도 DB 유니크 제약 위반은 500이 아니라 422
        DB::table('users')->where('id', 1)->update(['name_normalized' => 'racer']);
        $this->register('Racer', 'c@example.com')->assertStatus(422)->assertJsonPath('error.code', 'name_taken');
    }

    public function test_문자규칙_금칙어_거부와_check_name_응답(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->register('Tester', 'a@example.com')->assertCreated();
        $cases = ['a' => 'length', '열세글자를넘는아주긴이름입니다' => 'length', 'ab cd' => 'invalid_chars', 'ab!' => 'invalid_chars', 'ㅋㅋㅋ' => 'invalid_chars',
            '12345' => 'digits_only', 'Admin01' => 'forbidden', '운영자님' => 'forbidden', 'tester' => 'taken'];
        foreach ($cases as $name => $reason) {
            $this->getJson('/api/auth/check-name?name='.urlencode($name))->assertOk()->assertExactJson(['available' => false, 'reason' => $reason]);
        }
        $this->getJson('/api/auth/check-name?name='.urlencode('용사123'))->assertOk()->assertExactJson(['available' => true, 'reason' => null]);
        $this->register('Admin01', 'x@example.com')->assertStatus(422)->assertJsonPath('error.code', 'name_forbidden');
        $this->register('용사123', 'y@example.com', ['terms_accepted' => false])->assertStatus(422);   // 약관 미동의
        $this->register('Same1234', 'z@example.com', ['password' => 'same1234', 'password_confirmation' => 'same1234'])->assertStatus(422)->assertJsonPath('error.code', 'password_same_as_identity');
        // 게스트: 같은 문자 규칙 + 서버 부여 접미 숫자(유니크 제외)
        $this->postJson('/api/guests', ['nickname' => 'bad name'])->assertStatus(422)->assertJsonPath('error.code', 'name_invalid_chars');
        $g = $this->postJson('/api/guests', ['nickname' => 'Tester'])->assertCreated();
        $this->assertMatchesRegularExpression('/^Tester#\d{4}$/', $g->json('user.name'));
    }
}
