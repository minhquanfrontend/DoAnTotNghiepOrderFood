from rest_framework import serializers
from .models import Payment, PaymentMethod, Refund

class PaymentSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    
    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ('user', 'transaction_id', 'gateway_response', 'paid_at')

class PaymentMethodSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source='get_method_type_display', read_only=True)
    
    class Meta:
        model = PaymentMethod
        fields = '__all__'
        read_only_fields = ('user', 'stripe_customer_id', 'stripe_payment_method_id')

class CreatePaymentSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
    payment_method = serializers.ChoiceField(choices=Payment.PAYMENT_METHODS)
    payment_method_id = serializers.CharField(required=False)  # For saved payment methods

class RefundSerializer(serializers.ModelSerializer):
    payment_order_number = serializers.CharField(source='payment.order.order_number', read_only=True)
    
    class Meta:
        model = Refund
        fields = '__all__'
        read_only_fields = ('refund_transaction_id', 'gateway_response', 'processed_at')
