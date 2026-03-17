<?php

namespace App\Services;

use Stripe\Stripe;
use Stripe\PaymentIntent;

class PaymentService
{
    public function __construct()
    {
        Stripe::setApiKey(config('services.stripe.secret'));
    }

    public function charge(array $params): array
    {
        $intent = PaymentIntent::create([
            'amount' => (int) ($params['amount'] * 100), // cents
            'currency' => $params['currency'] ?? 'usd',
            'payment_method' => $params['payment_method'],
            'confirm' => true,
            'description' => $params['description'] ?? '',
            'automatic_payment_methods' => [
                'enabled' => true,
                'allow_redirects' => 'never',
            ],
        ]);

        return [
            'id' => $intent->id,
            'status' => $intent->status,
            'amount' => $intent->amount / 100,
        ];
    }

    public function refund(string $paymentId, float $amount): array
    {
        $refund = \Stripe\Refund::create([
            'payment_intent' => $paymentId,
            'amount' => (int) ($amount * 100),
        ]);

        return [
            'id' => $refund->id,
            'status' => $refund->status,
            'amount' => $refund->amount / 100,
        ];
    }

    public function getPayment(string $paymentId): array
    {
        $intent = PaymentIntent::retrieve($paymentId);

        return [
            'id' => $intent->id,
            'status' => $intent->status,
            'amount' => $intent->amount / 100,
            'created' => $intent->created,
        ];
    }
}
