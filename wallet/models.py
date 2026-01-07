from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

class Wallet(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.email}'s Wallet - {self.balance}"

class Transaction(models.Model):
    TRANSACTION_TYPES = [
        ('TOP_UP', 'Nạp tiền'),
        ('PAYMENT', 'Thanh toán đơn hàng'),
        ('REFUND', 'Hoàn tiền'),
        ('WITHDRAW', 'Rút tiền'),
        ('TRANSFER', 'Chuyển tiền'),
    ]

    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name='transactions')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    reference_id = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=20, default='SUCCESS')  # SUCCESS, PENDING, FAILED

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_transaction_type_display()} - {self.amount} - {self.created_at}"
