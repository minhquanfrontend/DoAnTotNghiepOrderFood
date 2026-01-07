from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.contrib.auth import get_user_model

from .models import Wallet, Transaction
from .serializers import (
    WalletSerializer, 
    TransactionSerializer, 
    TopUpSerializer,
    TransferSerializer
)

User = get_user_model()

class WalletDetail(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        wallet, created = Wallet.objects.get_or_create(user=request.user)
        serializer = WalletSerializer(wallet)
        return Response(serializer.data)

class TransactionList(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        wallet = get_object_or_404(Wallet, user=request.user)
        transactions = wallet.transactions.all().order_by('-created_at')
        serializer = TransactionSerializer(transactions, many=True)
        return Response(serializer.data)

class TopUpView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = TopUpSerializer(data=request.data)
        if serializer.is_valid():
            wallet, _ = Wallet.objects.get_or_create(user=request.user)
            amount = serializer.validated_data['amount']
            
            # Update wallet balance
            wallet.balance += amount
            wallet.save()
            
            # Create transaction record
            transaction = Transaction.objects.create(
                wallet=wallet,
                amount=amount,
                transaction_type='TOP_UP',
                description=f'Nạp tiền vào ví: {amount:,.0f} VND',
                status='SUCCESS'
            )
            
            return Response({
                'message': 'Nạp tiền thành công',
                'new_balance': wallet.balance,
                'transaction': TransactionSerializer(transaction).data
            }, status=status.HTTP_200_OK)
            
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class TransferView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = TransferSerializer(data=request.data)
        if serializer.is_valid():
            sender_wallet = get_object_or_404(Wallet, user=request.user)
            receiver_email = serializer.validated_data['receiver_email']
            amount = serializer.validated_data['amount']
            description = serializer.validated_data.get('description', '')
            
            # Check if sender has enough balance
            if sender_wallet.balance < amount:
                return Response(
                    {'error': 'Số dư không đủ để thực hiện giao dịch'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get or create receiver's wallet
            try:
                receiver = User.objects.get(email=receiver_email)
                if receiver == request.user:
                    return Response(
                        {'error': 'Không thể chuyển tiền cho chính mình'}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                receiver_wallet, _ = Wallet.objects.get_or_create(user=receiver)
                
                # Perform transfer
                sender_wallet.balance -= amount
                receiver_wallet.balance += amount
                
                sender_wallet.save()
                receiver_wallet.save()
                
                # Create transaction records
                Transaction.objects.create(
                    wallet=sender_wallet,
                    amount=-amount,
                    transaction_type='TRANSFER',
                    description=f'Chuyển tiền cho {receiver_email}: {amount:,.0f} VND. {description}',
                    status='SUCCESS'
                )
                
                Transaction.objects.create(
                    wallet=receiver_wallet,
                    amount=amount,
                    transaction_type='TRANSFER',
                    description=f'Nhận tiền từ {request.user.email}: {amount:,.0f} VND. {description}',
                    status='SUCCESS'
                )
                
                return Response({
                    'message': 'Chuyển tiền thành công',
                    'new_balance': sender_wallet.balance
                })
                
            except User.DoesNotExist:
                return Response(
                    {'error': 'Người nhận không tồn tại'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
