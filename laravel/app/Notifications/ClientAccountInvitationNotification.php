<?php

namespace App\Notifications;

use App\Models\Client;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;

class ClientAccountInvitationNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly Client $client,
        private readonly string $plainToken,
        private readonly Carbon $expiresAt
    ) {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendBase = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        // The fragment is not sent in HTTP requests or Referer headers.
        $setupUrl = $frontendBase . '/accept-invitation#token=' . urlencode($this->plainToken);

        return (new MailMessage())
            ->subject('Set Up Your Client Portal Account')
            ->greeting('Hello ' . $this->client->full_name . ',')
            ->line('A client account (' . $this->client->client_code . ') has been created for you.')
            ->line('Use the secure link below to set your password and activate your account. Never share this link.')
            ->action('Complete Account Setup', $setupUrl)
            ->line('This invitation link expires at ' . $this->expiresAt->copy()->utc()->format('Y-m-d H:i:s') . ' UTC.');
    }
}
