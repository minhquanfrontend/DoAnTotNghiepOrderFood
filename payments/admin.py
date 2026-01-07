from django.contrib import admin
from .models import Payment, PaymentMethod, Refund

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'user', 'payment_method', 'amount', 'status', 'created_at')
    list_filter = ('payment_method', 'status', 'created_at')
    search_fields = ('order__order_number', 'user__username', 'transaction_id')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    list_display = ('user', 'method_type', 'card_last_four', 'is_default', 'is_active')
    list_filter = ('method_type', 'is_default', 'is_active')
    search_fields = ('user__username', 'card_last_four')

@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ('id', 'payment', 'amount', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('payment__order__order_number', 'reason')
    readonly_fields = ('created_at',)
