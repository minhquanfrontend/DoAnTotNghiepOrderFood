from rest_framework import serializers
from .models import Wallet, Transaction
from django.contrib.auth import get_user_model

User = get_user_model()

class WalletSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    
    class Meta:
        model = Wallet
        fields = ['id', 'user', 'user_email', 'balance', 'created_at', 'updated_at']
        read_only_fields = ['user', 'created_at', 'updated_at']

class TransactionSerializer(serializers.ModelSerializer):
    wallet_user = serializers.EmailField(source='wallet.user.email', read_only=True)
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    
    class Meta:
        model = Transaction
        fields = [
            'id', 'wallet', 'wallet_user', 'amount', 'transaction_type', 
            'transaction_type_display', 'description', 'created_at',
            'reference_id', 'status'
        ]
        read_only_fields = ['created_at', 'status']

class TopUpSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1000)  # Minimum 10,000 VND
    
    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Số tiền phải lớn hơn 0")
        return value

class TransferSerializer(serializers.Serializer):
    receiver_email = serializers.EmailField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1000)  # Minimum 10,000 VND
    description = serializers.CharField(max_length=255, required=False)
    
    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Số tiền phải lớn hơn 0")
        return value
