from django.db import models
from django.contrib.auth import get_user_model
from orders.models import Order

User = get_user_model()

class Payment(models.Model):
    PAYMENT_METHODS = (
        ('cash', 'Tiền mặt'),
        ('vnpay', 'VNPay'),
    )
    
    STATUS_CHOICES = (
        ('pending', 'Chờ thanh toán'),
        ('processing', 'Đang xử lý'),
        ('completed', 'Hoàn thành'),
        ('failed', 'Thất bại'),
        ('cancelled', 'Đã hủy'),
        ('refunded', 'Đã hoàn tiền'),
    )
    
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='payment')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payments', null=True, blank=True)
    
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Thông tin thanh toán
    transaction_id = models.CharField(max_length=100, blank=True, null=True)
    gateway_response = models.JSONField(blank=True, null=True)
    
    # Stripe specific
    stripe_payment_intent_id = models.CharField(max_length=200, blank=True, null=True)
    stripe_client_secret = models.CharField(max_length=200, blank=True, null=True)
    
    # Thời gian
    paid_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Thanh toán'
        verbose_name_plural = 'Thanh toán'
    
    def __str__(self):
        return f"Thanh toán #{self.id} - {self.order.order_number}"

class PaymentMethod(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payment_methods')
    method_type = models.CharField(max_length=20, choices=Payment.PAYMENT_METHODS)
    
    # Thông tin thẻ (được mã hóa)
    card_last_four = models.CharField(max_length=4, blank=True)
    card_brand = models.CharField(max_length=20, blank=True)
    
    # Stripe customer và payment method ID
    stripe_customer_id = models.CharField(max_length=200, blank=True)
    stripe_payment_method_id = models.CharField(max_length=200, blank=True)
    
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Phương thức thanh toán'
        verbose_name_plural = 'Phương thức thanh toán'
    
    def __str__(self):
        return f"{self.user.username} - {self.get_method_type_display()}"

class Refund(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Chờ xử lý'),
        ('processing', 'Đang xử lý'),
        ('completed', 'Hoàn thành'),
        ('failed', 'Thất bại'),
    )
    
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='refunds')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField(verbose_name='Lý do hoàn tiền')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Thông tin hoàn tiền
    refund_transaction_id = models.CharField(max_length=100, blank=True, null=True)
    gateway_response = models.JSONField(blank=True, null=True)
    
    processed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Hoàn tiền'
        verbose_name_plural = 'Hoàn tiền'
    
    def __str__(self):
        return f"Hoàn tiền #{self.id} - {self.payment.order.order_number}"
