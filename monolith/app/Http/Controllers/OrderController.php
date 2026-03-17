<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use App\Services\NotificationService;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    public function __construct(
        private PaymentService $paymentService,
        private NotificationService $notificationService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $orders = Order::forUser($request->user()->id)
            ->orderBy('created_at', 'desc')
            ->paginate($request->query('per_page', 20));

        return response()->json($orders);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $order = Order::forUser($request->user()->id)->findOrFail($id);
        return response()->json($order);
    }

    /**
     * Create order — this is the monolith's tightly-coupled flow.
     * In microservices, this becomes a saga across multiple services.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|string',
            'items.*.quantity' => 'required|integer|min:1',
            'payment_method' => 'required|string',
            'shipping_address' => 'required|array',
            'shipping_address.street' => 'required|string',
            'shipping_address.city' => 'required|string',
            'shipping_address.state' => 'required|string',
            'shipping_address.zip' => 'required|string',
            'shipping_address.country' => 'required|string',
            'notes' => 'nullable|string',
        ]);

        // === PROBLEM: This is all in one transaction ===
        // In the monolith, this works fine. But it touches:
        // 1. Products (stock check + decrement)
        // 2. Payment processing (Stripe)
        // 3. Order creation
        // 4. Notifications
        // All tightly coupled in a single request.

        // Step 1: Validate stock and calculate totals
        $items = [];
        $subtotal = 0;

        foreach ($validated['items'] as $item) {
            $product = Product::findOrFail($item['product_id']);

            if ($product->stock < $item['quantity']) {
                return response()->json([
                    'error' => "Insufficient stock for {$product->name}",
                ], 422);
            }

            $items[] = [
                'product_id' => $product->id,
                'name' => $product->name,
                'price' => $product->price,
                'quantity' => $item['quantity'],
                'total' => $product->price * $item['quantity'],
            ];

            $subtotal += $product->price * $item['quantity'];
        }

        $tax = round($subtotal * 0.08, 2); // 8% tax
        $shippingCost = $subtotal > 100 ? 0 : 9.99;
        $total = $subtotal + $tax + $shippingCost;

        // Step 2: Process payment
        try {
            $paymentResult = $this->paymentService->charge([
                'amount' => $total,
                'currency' => 'usd',
                'payment_method' => $validated['payment_method'],
                'description' => "Order for user {$request->user()->id}",
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Payment failed: ' . $e->getMessage()], 402);
        }

        // Step 3: Decrement stock
        foreach ($validated['items'] as $item) {
            $product = Product::find($item['product_id']);
            $product->decrementStock($item['quantity']);
        }

        // Step 4: Create order
        $order = Order::create([
            'user_id' => $request->user()->id,
            'items' => $items,
            'subtotal' => $subtotal,
            'tax' => $tax,
            'shipping_cost' => $shippingCost,
            'total' => $total,
            'status' => Order::STATUS_CONFIRMED,
            'payment_method' => $validated['payment_method'],
            'payment_id' => $paymentResult['id'],
            'shipping_address' => $validated['shipping_address'],
            'billing_address' => $validated['shipping_address'],
            'notes' => $validated['notes'] ?? null,
        ]);

        // Step 5: Send notification
        $this->notificationService->send($request->user()->id, 'order_confirmed', [
            'title' => 'Order Confirmed',
            'body' => "Your order #{$order->id} has been confirmed. Total: \${$total}",
            'order_id' => $order->id,
        ]);

        return response()->json($order, 201);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $order = Order::forUser($request->user()->id)->findOrFail($id);

        if (!$order->canBeCancelled()) {
            return response()->json(['error' => 'Order cannot be cancelled'], 422);
        }

        // Refund payment
        if ($order->isPaid()) {
            $this->paymentService->refund($order->payment_id, $order->total);
        }

        // Restore stock
        foreach ($order->items as $item) {
            $product = Product::find($item['product_id']);
            if ($product) {
                $product->incrementStock($item['quantity']);
            }
        }

        $order->update([
            'status' => Order::STATUS_CANCELLED,
            'cancelled_at' => now(),
            'cancellation_reason' => $request->input('reason', 'Customer requested'),
        ]);

        $this->notificationService->send($request->user()->id, 'order_cancelled', [
            'title' => 'Order Cancelled',
            'body' => "Your order #{$order->id} has been cancelled.",
            'order_id' => $order->id,
        ]);

        return response()->json($order);
    }
}
