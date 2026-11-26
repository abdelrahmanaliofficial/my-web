<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class AuthenticationSessionTest extends TestCase
{
    use RefreshDatabase;

    private function firstPartyHeaders(): array
    {
        return [
            'Origin' => 'http://localhost:3000',
            'Referer' => 'http://localhost:3000/login',
        ];
    }

    public function test_valid_login_creates_a_versioned_session_and_me_returns_only_safe_user_data(): void
    {
        $user = User::factory()->create([
            'email' => 'auth@example.com',
            'role' => 'super_admin',
            'is_active' => true,
            'suspended_at' => null,
        ]);

        $loginResponse = $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/login', [
                'email' => 'AUTH@example.com',
                'password' => 'test-password-not-for-production',
                'remember' => false,
            ]);

        $loginResponse->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.email', 'auth@example.com')
            ->assertJsonMissingPath('data.password')
            ->assertJsonMissingPath('data.remember_token');

        $sessionCookie = collect($loginResponse->getBaseResponse()->headers->getCookies())
            ->first(fn ($cookie) => str_ends_with($cookie->getName(), '_session'));
        $this->assertNotNull($sessionCookie, 'The session cookie should be present after successful login.');
        $this->assertTrue($sessionCookie->isHttpOnly(), 'The session cookie must be HttpOnly.');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'auth_version' => 1,
        ]);

        $this->withHeaders($this->firstPartyHeaders())
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonMissingPath('data.password');
    }

    public function test_sanctum_csrf_cookie_endpoint_is_available_for_the_first_party_frontend(): void
    {
        $response = $this->withHeaders($this->firstPartyHeaders())->get('/sanctum/csrf-cookie');

        $response->assertNoContent();
        $this->assertNotEmpty($response->getBaseResponse()->headers->getCookies());
    }

    public function test_login_requires_a_stateful_first_party_request(): void
    {
        $user = User::factory()->create(['email' => 'origin-required@example.com']);

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'test-password-not-for-production',
        ])->assertStatus(419)->assertJsonPath('code', 'stateful_session_required');
    }

    public function test_login_is_rate_limited_per_ip_and_email(): void
    {
        User::factory()->create(['email' => 'rate-limit@example.com']);

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->withHeaders($this->firstPartyHeaders())
                ->postJson('/api/login', [
                    'email' => 'rate-limit@example.com',
                    'password' => 'wrong-password',
                ])->assertStatus(422);
        }

        $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/login', [
                'email' => 'rate-limit@example.com',
                'password' => 'wrong-password',
            ])->assertStatus(429);
    }

    public function test_password_change_rotates_current_session_version(): void
    {
        $user = User::factory()->create(['email' => 'password-change@example.com']);

        $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'test-password-not-for-production',
            ])->assertOk();

        $this->withHeaders($this->firstPartyHeaders())
            ->putJson('/api/me/password', [
                'current_password' => 'test-password-not-for-production',
                'password' => 'UpdatedSecurePass123',
                'password_confirmation' => 'UpdatedSecurePass123',
            ])->assertOk();

        $user->refresh();
        $this->assertSame(2, (int) $user->auth_version);

        $this->withHeaders($this->firstPartyHeaders())
            ->getJson('/api/me')
            ->assertOk();
    }

    public function test_remember_cookie_can_restore_a_session_but_is_revoked_with_auth_version(): void
    {
        $user = User::factory()->create(['email' => 'remember@example.com']);

        $loginResponse = $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'test-password-not-for-production',
                'remember' => true,
            ]);
        $loginResponse->assertOk();

        $rememberCookie = collect($loginResponse->getBaseResponse()->headers->getCookies())
            ->first(fn ($cookie) => str_starts_with($cookie->getName(), 'remember_web_'));
        $this->assertNotNull($rememberCookie, 'Remember-me cookie should be issued when requested.');

        $this->withCookie($rememberCookie->getName(), $rememberCookie->getValue())
            ->withHeaders($this->firstPartyHeaders())
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);

        $user->refresh()->bumpAuthVersion();

        $this->withCookie($rememberCookie->getName(), $rememberCookie->getValue())
            ->withHeaders($this->firstPartyHeaders())
            ->getJson('/api/me')
            ->assertUnauthorized();
    }

    public function test_invalid_credentials_are_rejected(): void
    {
        User::factory()->create(['email' => 'auth@example.com']);

        $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/login', [
                'email' => 'auth@example.com',
                'password' => 'not-the-password',
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'invalid_credentials');
    }

    public function test_inactive_or_suspended_accounts_cannot_sign_in(): void
    {
        User::factory()->create([
            'email' => 'suspended@example.com',
            'is_active' => false,
            'suspended_at' => now(),
        ]);

        $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/login', [
                'email' => 'suspended@example.com',
                'password' => 'test-password-not-for-production',
            ])
            ->assertForbidden()
            ->assertJsonPath('code', 'account_inactive');
    }

    public function test_unauthenticated_user_cannot_access_current_user_endpoint(): void
    {
        $this->withHeaders($this->firstPartyHeaders())
            ->getJson('/api/me')
            ->assertUnauthorized();
    }

    public function test_logout_invalidates_the_authenticated_session(): void
    {
        $user = User::factory()->create(['email' => 'logout@example.com']);

        $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'test-password-not-for-production',
            ])
            ->assertOk();

        $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/logout')
            ->assertOk();

        $this->withHeaders($this->firstPartyHeaders())
            ->getJson('/api/me')
            ->assertUnauthorized();
    }

    public function test_stale_session_version_is_rejected(): void
    {
        $user = User::factory()->create(['auth_version' => 3]);

        $this->actingAs($user, 'web')
            ->withSession(['auth_session_version' => 2])
            ->withHeaders($this->firstPartyHeaders())
            ->getJson('/api/me')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'session_revoked');
    }

    public function test_suspended_user_is_rejected_even_if_the_session_is_still_present(): void
    {
        $user = User::factory()->create([
            'is_active' => false,
            'suspended_at' => now(),
        ]);

        $this->actingAs($user, 'web')
            ->withSession(['auth_session_version' => 1])
            ->withHeaders($this->firstPartyHeaders())
            ->getJson('/api/me')
            ->assertForbidden()
            ->assertJsonPath('code', 'account_inactive');
    }

    public function test_suspending_a_team_member_increments_the_authentication_version(): void
    {
        $superAdmin = User::factory()->create([
            'role' => 'super_admin',
            'is_active' => true,
            'suspended_at' => null,
        ]);
        $teamMember = User::factory()->create([
            'role' => 'custom_admin',
            'is_active' => true,
            'suspended_at' => null,
            'auth_version' => 1,
        ]);

        $this->actingAs($superAdmin, 'web')
            ->withHeaders($this->firstPartyHeaders())
            ->putJson('/api/team/' . $teamMember->id . '/status', ['is_active' => false])
            ->assertOk();

        $teamMember->refresh();
        $this->assertFalse($teamMember->isActive());
        $this->assertSame(2, (int) $teamMember->auth_version);
    }

    public function test_session_lifetime_and_cookie_security_defaults_are_configured(): void
    {
        $this->assertSame(120, (int) config('session.lifetime'));
        $this->assertTrue((bool) config('session.http_only'));
        $this->assertSame('lax', config('session.same_site'));
    }

    public function test_password_reset_sends_generic_response_and_notifies_known_accounts(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'reset@example.com']);

        $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/password/forgot', ['email' => 'reset@example.com'])
            ->assertOk();

        Notification::assertSentTo($user, ResetPassword::class);

        $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/password/forgot', ['email' => 'not-registered@example.com'])
            ->assertOk();
    }

    public function test_successful_password_reset_increments_auth_version_and_keeps_suspended_accounts_suspended(): void
    {
        $pending = User::factory()->unverified()->create([
            'email' => 'pending@example.com',
            'is_active' => false,
            'suspended_at' => null,
            'auth_version' => 1,
        ]);
        $pendingToken = Password::broker()->createToken($pending);

        $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/password/reset', [
                'email' => $pending->email,
                'token' => $pendingToken,
                'password' => 'NewSecurePass123',
                'password_confirmation' => 'NewSecurePass123',
            ])
            ->assertOk();

        $pending->refresh();
        $this->assertTrue($pending->isActive());
        $this->assertNotNull($pending->email_verified_at);
        $this->assertSame(2, (int) $pending->auth_version);
        $this->assertTrue(password_verify('NewSecurePass123', $pending->password));

        $suspended = User::factory()->create([
            'email' => 'suspended-reset@example.com',
            'is_active' => false,
            'suspended_at' => now(),
            'auth_version' => 4,
        ]);
        $suspendedToken = Password::broker()->createToken($suspended);

        $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/password/reset', [
                'email' => $suspended->email,
                'token' => $suspendedToken,
                'password' => 'AnotherSecure123',
                'password_confirmation' => 'AnotherSecure123',
            ])
            ->assertOk();

        $suspended->refresh();
        $this->assertFalse($suspended->isActive());
        $this->assertSame(5, (int) $suspended->auth_version);
    }

    public function test_email_verification_notification_and_signed_verification_link_work(): void
    {
        config(['app.frontend_url' => 'http://localhost:3000']);
        Notification::fake();
        $user = User::factory()->unverified()->create();

        $this->actingAs($user, 'web')
            ->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/email/verification-notification')
            ->assertOk()
            ->assertJsonPath('data.verified', false);

        Notification::assertSentTo($user, VerifyEmail::class);

        $verificationUrl = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(10),
            ['id' => $user->id, 'hash' => sha1($user->email)]
        );

        $this->get($verificationUrl)->assertRedirect('http://localhost:3000/login?verified=1');
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_required_email_verification_blocks_login_and_sends_verification_email(): void
    {
        Notification::fake();
        config(['auth.require_verified_email' => true]);
        $user = User::factory()->unverified()->create(['email' => 'verify-required@example.com']);

        $this->withHeaders($this->firstPartyHeaders())
            ->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'test-password-not-for-production',
            ])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_verification_required');

        Notification::assertSentTo($user, VerifyEmail::class);
    }
}
