/**
 * Unit Tests for Shopping Cart Module
 * Tests: add/remove items, quantity updates, discount codes
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Types
interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface DiscountCode {
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minPurchase?: number;
}

interface Cart {
  items: CartItem[];
  discountCode: DiscountCode | null;
}

// Mock Cart Implementation (replace with actual import)
class ShoppingCart {
  private items: CartItem[] = [];
  private appliedDiscount: DiscountCode | null = null;

  private validDiscounts: DiscountCode[] = [
    { code: 'SAVE10', type: 'percentage', value: 10 },
    { code: 'SAVE20', type: 'percentage', value: 20, minPurchase: 50 },
    { code: 'FLAT5', type: 'fixed', value: 5 },
    { code: 'FLAT15', type: 'fixed', value: 15, minPurchase: 30 },
  ];

  addItem(item: Omit<CartItem, 'quantity'>, quantity: number = 1): void {
    if (quantity <= 0) throw new Error('Quantity must be positive');
    
    const existing = this.items.find(i => i.id === item.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({ ...item, quantity });
    }
  }

  removeItem(itemId: string): void {
    const index = this.items.findIndex(i => i.id === itemId);
    if (index === -1) throw new Error('Item not found in cart');
    this.items.splice(index, 1);
  }

  updateQuantity(itemId: string, quantity: number): void {
    if (quantity < 0) throw new Error('Quantity cannot be negative');
    
    const item = this.items.find(i => i.id === itemId);
    if (!item) throw new Error('Item not found in cart');
    
    if (quantity === 0) {
      this.removeItem(itemId);
    } else {
      item.quantity = quantity;
    }
  }

  applyDiscountCode(code: string): void {
    const discount = this.validDiscounts.find(d => d.code === code.toUpperCase());
    if (!discount) throw new Error('Invalid discount code');
    
    if (discount.minPurchase && this.getSubtotal() < discount.minPurchase) {
      throw new Error(`Minimum purchase of $${discount.minPurchase} required`);
    }
    
    this.appliedDiscount = discount;
  }

  removeDiscountCode(): void {
    this.appliedDiscount = null;
  }

  getItems(): CartItem[] {
    return [...this.items];
  }

  getItemCount(): number {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  getSubtotal(): number {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  getDiscount(): number {
    if (!this.appliedDiscount) return 0;
    
    const subtotal = this.getSubtotal();
    if (this.appliedDiscount.type === 'percentage') {
      return subtotal * (this.appliedDiscount.value / 100);
    }
    return Math.min(this.appliedDiscount.value, subtotal);
  }

  getTotal(): number {
    return Math.max(0, this.getSubtotal() - this.getDiscount());
  }

  getAppliedDiscount(): DiscountCode | null {
    return this.appliedDiscount;
  }

  clear(): void {
    this.items = [];
    this.appliedDiscount = null;
  }
}

// Test Suite
describe('ShoppingCart', () => {
  let cart: ShoppingCart;

  const sampleProducts = {
    apple: { id: 'apple-1', name: 'Apple', price: 1.50 },
    banana: { id: 'banana-1', name: 'Banana', price: 0.75 },
    orange: { id: 'orange-1', name: 'Orange', price: 2.00 },
    mango: { id: 'mango-1', name: 'Mango', price: 3.50 },
  };

  beforeEach(() => {
    cart = new ShoppingCart();
  });

  describe('Adding Items', () => {
    it('should add a new item to empty cart', () => {
      cart.addItem(sampleProducts.apple);
      
      const items = cart.getItems();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('apple-1');
      expect(items[0].quantity).toBe(1);
    });

    it('should add item with specified quantity', () => {
      cart.addItem(sampleProducts.apple, 5);
      
      const items = cart.getItems();
      expect(items[0].quantity).toBe(5);
    });

    it('should increase quantity when adding existing item', () => {
      cart.addItem(sampleProducts.apple, 2);
      cart.addItem(sampleProducts.apple, 3);
      
      const items = cart.getItems();
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(5);
    });

    it('should add multiple different items', () => {
      cart.addItem(sampleProducts.apple);
      cart.addItem(sampleProducts.banana);
      cart.addItem(sampleProducts.orange);
      
      expect(cart.getItems()).toHaveLength(3);
      expect(cart.getItemCount()).toBe(3);
    });

    it('should throw error for zero quantity', () => {
      expect(() => cart.addItem(sampleProducts.apple, 0)).toThrow('Quantity must be positive');
    });

    it('should throw error for negative quantity', () => {
      expect(() => cart.addItem(sampleProducts.apple, -1)).toThrow('Quantity must be positive');
    });

    it('should preserve item price when adding', () => {
      cart.addItem(sampleProducts.mango, 2);
      
      const items = cart.getItems();
      expect(items[0].price).toBe(3.50);
    });
  });

  describe('Removing Items', () => {
    beforeEach(() => {
      cart.addItem(sampleProducts.apple, 2);
      cart.addItem(sampleProducts.banana, 3);
    });

    it('should remove an existing item', () => {
      cart.removeItem('apple-1');
      
      const items = cart.getItems();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('banana-1');
    });

    it('should throw error when removing non-existent item', () => {
      expect(() => cart.removeItem('nonexistent')).toThrow('Item not found in cart');
    });

    it('should update item count after removal', () => {
      expect(cart.getItemCount()).toBe(5);
      cart.removeItem('apple-1');
      expect(cart.getItemCount()).toBe(3);
    });

    it('should result in empty cart when last item removed', () => {
      cart.removeItem('apple-1');
      cart.removeItem('banana-1');
      
      expect(cart.getItems()).toHaveLength(0);
      expect(cart.getItemCount()).toBe(0);
    });
  });

  describe('Updating Quantity', () => {
    beforeEach(() => {
      cart.addItem(sampleProducts.apple, 5);
      cart.addItem(sampleProducts.banana, 3);
    });

    it('should update quantity of existing item', () => {
      cart.updateQuantity('apple-1', 10);
      
      const apple = cart.getItems().find(i => i.id === 'apple-1');
      expect(apple?.quantity).toBe(10);
    });

    it('should remove item when quantity set to zero', () => {
      cart.updateQuantity('apple-1', 0);
      
      expect(cart.getItems()).toHaveLength(1);
      expect(cart.getItems().find(i => i.id === 'apple-1')).toBeUndefined();
    });

    it('should throw error for negative quantity', () => {
      expect(() => cart.updateQuantity('apple-1', -5)).toThrow('Quantity cannot be negative');
    });

    it('should throw error for non-existent item', () => {
      expect(() => cart.updateQuantity('nonexistent', 5)).toThrow('Item not found in cart');
    });

    it('should not affect other items', () => {
      cart.updateQuantity('apple-1', 1);
      
      const banana = cart.getItems().find(i => i.id === 'banana-1');
      expect(banana?.quantity).toBe(3);
    });
  });

  describe('Discount Codes', () => {
    beforeEach(() => {
      // Add items totaling $60
      cart.addItem(sampleProducts.mango, 10); // 10 * $3.50 = $35
      cart.addItem(sampleProducts.orange, 10); // 10 * $2.00 = $20
      cart.addItem(sampleProducts.apple, 2);  // 2 * $1.50 = $3
      // Total = $58 (close enough for testing min purchase)
    });

    describe('Percentage Discounts', () => {
      it('should apply percentage discount (SAVE10)', () => {
        cart.applyDiscountCode('SAVE10');
        
        const subtotal = cart.getSubtotal();
        const discount = cart.getDiscount();
        expect(discount).toBe(subtotal * 0.10);
      });

      it('should apply percentage discount with min purchase met (SAVE20)', () => {
        cart.applyDiscountCode('SAVE20');
        
        expect(cart.getAppliedDiscount()?.code).toBe('SAVE20');
        expect(cart.getDiscount()).toBe(cart.getSubtotal() * 0.20);
      });

      it('should reject discount when min purchase not met', () => {
        cart.clear();
        cart.addItem(sampleProducts.apple, 2); // $3 total
        
        expect(() => cart.applyDiscountCode('SAVE20')).toThrow('Minimum purchase of $50 required');
      });
    });

    describe('Fixed Discounts', () => {
      it('should apply fixed discount (FLAT5)', () => {
        cart.applyDiscountCode('FLAT5');
        
        expect(cart.getDiscount()).toBe(5);
      });

      it('should apply fixed discount with min purchase met (FLAT15)', () => {
        cart.applyDiscountCode('FLAT15');
        
        expect(cart.getDiscount()).toBe(15);
      });

      it('should reject fixed discount when min purchase not met', () => {
        cart.clear();
        cart.addItem(sampleProducts.apple, 2); // $3 total
        
        expect(() => cart.applyDiscountCode('FLAT15')).toThrow('Minimum purchase of $30 required');
      });

      it('should cap fixed discount at subtotal', () => {
        cart.clear();
        cart.addItem(sampleProducts.apple, 2); // $3 total
        cart.applyDiscountCode('FLAT5');
        
        expect(cart.getDiscount()).toBe(3); // Capped at subtotal
        expect(cart.getTotal()).toBe(0);
      });
    });

    describe('Discount Code Validation', () => {
      it('should throw error for invalid code', () => {
        expect(() => cart.applyDiscountCode('INVALID')).toThrow('Invalid discount code');
      });

      it('should be case-insensitive', () => {
        cart.applyDiscountCode('save10');
        expect(cart.getAppliedDiscount()?.code).toBe('SAVE10');
      });

      it('should replace previous discount', () => {
        cart.applyDiscountCode('SAVE10');
        cart.applyDiscountCode('FLAT5');
        
        expect(cart.getAppliedDiscount()?.code).toBe('FLAT5');
      });

      it('should remove discount code', () => {
        cart.applyDiscountCode('SAVE10');
        cart.removeDiscountCode();
        
        expect(cart.getAppliedDiscount()).toBeNull();
        expect(cart.getDiscount()).toBe(0);
      });
    });
  });

  describe('Cart Totals', () => {
    it('should calculate subtotal correctly', () => {
      cart.addItem(sampleProducts.apple, 4);  // 4 * 1.50 = 6.00
      cart.addItem(sampleProducts.banana, 2); // 2 * 0.75 = 1.50
      
      expect(cart.getSubtotal()).toBe(7.50);
    });

    it('should calculate total with percentage discount', () => {
      cart.addItem(sampleProducts.orange, 10); // $20
      cart.applyDiscountCode('SAVE10'); // 10% off
      
      expect(cart.getSubtotal()).toBe(20);
      expect(cart.getDiscount()).toBe(2);
      expect(cart.getTotal()).toBe(18);
    });

    it('should calculate total with fixed discount', () => {
      cart.addItem(sampleProducts.orange, 10); // $20
      cart.applyDiscountCode('FLAT5');
      
      expect(cart.getTotal()).toBe(15);
    });

    it('should return zero for empty cart', () => {
      expect(cart.getSubtotal()).toBe(0);
      expect(cart.getTotal()).toBe(0);
      expect(cart.getItemCount()).toBe(0);
    });

    it('should never return negative total', () => {
      cart.addItem(sampleProducts.apple, 1); // $1.50
      cart.applyDiscountCode('FLAT5');
      
      expect(cart.getTotal()).toBe(0);
    });
  });

  describe('Cart Clear', () => {
    it('should clear all items and discounts', () => {
      cart.addItem(sampleProducts.apple, 5);
      cart.addItem(sampleProducts.banana, 3);
      cart.applyDiscountCode('SAVE10');
      
      cart.clear();
      
      expect(cart.getItems()).toHaveLength(0);
      expect(cart.getAppliedDiscount()).toBeNull();
      expect(cart.getTotal()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large quantities', () => {
      cart.addItem(sampleProducts.apple, 1000000);
      expect(cart.getItemCount()).toBe(1000000);
      expect(cart.getSubtotal()).toBe(1500000);
    });

    it('should handle decimal prices correctly', () => {
      cart.addItem(sampleProducts.apple, 3);  // 3 * 1.50 = 4.50
      cart.addItem(sampleProducts.banana, 7); // 7 * 0.75 = 5.25
      
      expect(cart.getSubtotal()).toBeCloseTo(9.75, 2);
    });

    it('should maintain item integrity after multiple operations', () => {
      cart.addItem(sampleProducts.apple, 5);
      cart.addItem(sampleProducts.banana, 3);
      cart.updateQuantity('apple-1', 2);
      cart.addItem(sampleProducts.apple, 3);
      cart.removeItem('banana-1');
      
      expect(cart.getItems()).toHaveLength(1);
      expect(cart.getItems()[0].quantity).toBe(5);
    });
  });
});
