<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

class NotificationService
{
    /**
     * Send notification through all configured channels.
     * In the monolith, this is synchronous and tightly coupled.
     * In microservices, this becomes an event consumer.
     */
    public function send(string $userId, string $type, array $data): void
    {
        $user = User::find($userId);
        if (!$user) return;

        // Store in-app notification
        Notification::create([
            'user_id' => $userId,
            'type' => $type,
            'channel' => 'in_app',
            'title' => $data['title'],
            'body' => $data['body'],
            'data' => $data,
            'sent_at' => now(),
        ]);

        // Send email for important notifications
        if (in_array($type, ['order_confirmed', 'order_shipped', 'order_cancelled', 'welcome'])) {
            $this->sendEmail($user, $data);
        }

        // Send SMS for order status changes
        if (in_array($type, ['order_shipped', 'order_delivered']) && $user->phone) {
            $this->sendSms($user->phone, $data['body']);
        }
    }

    public function getUnread(string $userId): array
    {
        return Notification::where('user_id', $userId)
            ->unread()
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get()
            ->toArray();
    }

    public function markAsRead(string $notificationId): void
    {
        $notification = Notification::find($notificationId);
        $notification?->markAsRead();
    }

    public function markAllAsRead(string $userId): void
    {
        Notification::where('user_id', $userId)
            ->unread()
            ->update(['read_at' => now()]);
    }

    private function sendEmail(User $user, array $data): void
    {
        try {
            Mail::raw($data['body'], function ($message) use ($user, $data) {
                $message->to($user->email)
                    ->subject($data['title']);
            });
        } catch (\Exception $e) {
            Log::error("Failed to send email to {$user->email}: {$e->getMessage()}");
        }
    }

    private function sendSms(string $phone, string $message): void
    {
        try {
            // Twilio integration
            $client = new \Twilio\Rest\Client(
                config('services.twilio.sid'),
                config('services.twilio.token')
            );

            $client->messages->create($phone, [
                'from' => config('services.twilio.from'),
                'body' => $message,
            ]);
        } catch (\Exception $e) {
            Log::error("Failed to send SMS to {$phone}: {$e->getMessage()}");
        }
    }
}
