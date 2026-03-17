<?php

namespace App\Models;

use MongoDB\Laravel\Eloquent\Model;

class Product extends Model
{
    protected $connection = 'mongodb';
    protected $collection = 'products';

    protected $fillable = [
        'name',
        'slug',
        'description',
        'price',
        'compare_price',
        'sku',
        'stock',
        'category',
        'tags',
        'images',
        'attributes',
        'is_active',
        'weight',
        'dimensions',
    ];

    protected $casts = [
        'price' => 'float',
        'compare_price' => 'float',
        'stock' => 'integer',
        'tags' => 'array',
        'images' => 'array',
        'attributes' => 'array',
        'dimensions' => 'array',
        'is_active' => 'boolean',
        'weight' => 'float',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeInStock($query)
    {
        return $query->where('stock', '>', 0);
    }

    public function scopeByCategory($query, string $category)
    {
        return $query->where('category', $category);
    }

    public function decrementStock(int $quantity): bool
    {
        if ($this->stock < $quantity) {
            return false;
        }

        $this->decrement('stock', $quantity);
        return true;
    }

    public function incrementStock(int $quantity): void
    {
        $this->increment('stock', $quantity);
    }
}
