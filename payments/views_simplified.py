from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.urls import reverse
from django.utils import timezone
import hashlib
import hmac
import urllib.parse
import time
import qrcode
import io
import base64
from .models import Payment, PaymentMethod, Refund
from .serializers import PaymentSerializer, PaymentMethodSerializer, CreatePaymentSerializer, RefundSerializer
from orders.models import Order

# ==================== HELPER FUNCTIONS ====================

def generate_qr_code_base64(data):
    """Generate QR code and return as base64 string"""
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{img_base64}"

def generate_vnpay_url(order, payment, request):
    """Generate VNPay payment URL"""
    vnp_tmn_code = getattr(settings, 'VNPAY_TMN_CODE', 'CTN361U1')
    vnp_hash_secret = getattr(settings, 'VNPAY_HASH_SECRET', 'BOSNIANCUSMTW3IAGVXG9K7AYGVC9W1N')
    vnp_url = getattr(settings, 'VNPAY_PAYMENT_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html')
    
    # Create payment data
    vnp_txn_ref = f"ORDER_{payment.id}_{int(time.time())}"
    vnp_amount = int(order.total_amount * 100)  # VNPay uses smallest currency unit
    
    vnp_params = {
        'vnp_Version': '2.1.0',
        'vnp_Command': 'pay',
        'vnp_TmnCode': vnp_tmn_code,
        'vnp_Amount': str(vnp_amount),
        'vnp_CurrCode': 'VND',
        'vnp_TxnRef': vnp_txn_ref,
        'vnp_OrderInfo': f'Thanh toan don hang {order.order_number}',
        'vnp_OrderType': 'other',
        'vnp_Locale': 'vn',
        'vnp_ReturnUrl': f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')}/payment-success",
        'vnp_IpnUrl': request.build_absolute_uri(reverse('vnpay_callback')),
        'vnp_CreateDate': timezone.now().strftime('%Y%m%d%H%M%S'),
        'vnp_IpAddr': request.META.get('REMOTE_ADDR', '127.0.0.1')
    }
    
    # Sort and create query string
    sorted_params = sorted(vnp_params.items())
    query_string = '&'.join([f"{k}={urllib.parse.quote_plus(str(v))}" for k, v in sorted_params])
    
    # Create signature
    hash_data = '&'.join([f"{k}={v}" for k, v in sorted_params])
    secure_hash = hmac.new(
        vnp_hash_secret.encode('utf-8'),
        hash_data.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    # Final payment URL
    payment_url = f"{vnp_url}?{query_string}&vnp_SecureHash={secure_hash}"
    
    # Generate QR code for payment URL
    qr_code = generate_qr_code_base64(payment_url)
    
    return {
        'payment_url': payment_url,
        'qr_code': qr_code,
        'txn_ref': vnp_txn_ref
    }

# ==================== API VIEWS ====================

class PaymentListView(generics.ListAPIView):
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Payment.objects.filter(user=self.request.user)

class PaymentDetailView(generics.RetrieveAPIView):
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Payment.objects.filter(user=self.request.user)

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def create_payment(request):
    """Create payment - supports both authenticated users and guests"""
    serializer = CreatePaymentSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    order_id = serializer.validated_data['order_id']
    payment_method = serializer.validated_data['payment_method']
    
    # Get order - support both authenticated and guest users
    try:
        if request.user.is_authenticated:
            order = Order.objects.get(id=order_id, customer=request.user)
        else:
            order = Order.objects.get(id=order_id)
            # For guest users with online payment, require email
            if payment_method != 'cash':
                guest_email = request.data.get('email')
                if not guest_email:
                    return Response({'error': 'Email là bắt buộc cho thanh toán online'}, 
                                  status=status.HTTP_400_BAD_REQUEST)
                # Save email to order for notification
                order.customer_email = guest_email
                order.save()
    except Order.DoesNotExist:
        return Response({'error': 'Không tìm thấy đơn hàng'}, status=status.HTTP_404_NOT_FOUND)
    
    # Check if payment already exists
    if hasattr(order, 'payment'):
        return Response({'error': 'Đơn hàng đã có thanh toán'}, 
                       status=status.HTTP_400_BAD_REQUEST)
    
    # Create payment
    payment = Payment.objects.create(
        order=order,
        user=request.user if request.user.is_authenticated else None,
        payment_method=payment_method,
        amount=order.total_amount
    )
    
    # Update order payment status
    if order.payment_status != "paid":
        order.payment_status = "pending"
        order.save()
    
    # Handle payment method
    if payment_method == 'cash':
        payment.status = 'pending'
        payment.save()
        
        return Response({
            'message': 'Đã tạo thanh toán tiền mặt. Vui lòng thanh toán khi nhận hàng.',
            'payment': PaymentSerializer(payment).data
        })
    
    elif payment_method == 'vnpay':
        # VNPay Payment URL
        vnpay_data = generate_vnpay_url(order, payment, request)
        payment.status = 'processing'
        payment.gateway_response = vnpay_data
        payment.save()
        
        return Response({
            'message': 'Chuyển hướng đến VNPay để thanh toán',
            'payment': PaymentSerializer(payment).data,
            'payment_url': vnpay_data.get('payment_url'),
            'qr_code': vnpay_data.get('qr_code'),
            'txn_ref': vnpay_data.get('txn_ref')
        })
    
    else:
        return Response({'error': 'Phương thức thanh toán không được hỗ trợ'}, 
                       status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def get_payment_methods(request):
    """Get available payment methods"""
    methods = [
        {
            'id': 'cash',
            'name': 'Tiền mặt',
            'description': 'Thanh toán khi nhận hàng (COD)',
            'icon': 'cash-outline',
            'enabled': True,
            'fee': 0
        },
        {
            'id': 'vnpay',
            'name': 'VNPay',
            'description': 'Thanh toán qua VNPay (ATM, Visa, Mastercard)',
            'icon': 'card-outline',
            'enabled': True,
            'fee': 0
        }
    ]
    
    return Response(methods)

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def confirm_payment(request, payment_id):
    """Confirm payment (for COD after delivery)"""
    payment = get_object_or_404(Payment, id=payment_id)
    
    # Only shipper or admin can confirm COD payment
    if not (request.user.user_type in ['shipper', 'admin'] or request.user.is_staff):
        return Response({'error': 'Không có quyền xác nhận thanh toán'}, 
                       status=status.HTTP_403_FORBIDDEN)
    
    if payment.payment_method != 'cash':
        return Response({'error': 'Chỉ có thể xác nhận thanh toán tiền mặt'}, 
                       status=status.HTTP_400_BAD_REQUEST)
    
    if payment.status == 'completed':
        return Response({'error': 'Thanh toán đã được xác nhận'}, 
                       status=status.HTTP_400_BAD_REQUEST)
    
    payment.status = 'completed'
    payment.paid_at = timezone.now()
    payment.save()
    
    # Update order payment status
    payment.order.payment_status = 'paid'
    payment.order.save()
    
    return Response({
        'message': 'Đã xác nhận thanh toán',
        'payment': PaymentSerializer(payment).data
    })

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def request_refund(request, payment_id):
    """Request refund for a payment"""
    payment = get_object_or_404(Payment, id=payment_id, user=request.user)
    
    if payment.status != 'completed':
        return Response({'error': 'Chỉ có thể hoàn tiền cho thanh toán đã hoàn thành'}, 
                       status=status.HTTP_400_BAD_REQUEST)
    
    reason = request.data.get('reason', '')
    amount = request.data.get('amount', payment.amount)
    
    refund = Refund.objects.create(
        payment=payment,
        amount=amount,
        reason=reason
    )
    
    return Response({
        'message': 'Đã gửi yêu cầu hoàn tiền',
        'refund': RefundSerializer(refund).data
    })

# ==================== VNPAY CALLBACK ====================

@api_view(['GET', 'POST'])
@permission_classes([permissions.AllowAny])
def vnpay_callback(request):
    """Handle VNPay payment callback"""
    try:
        data = request.GET if request.method == 'GET' else request.data
        
        vnp_txn_ref = data.get('vnp_TxnRef')
        vnp_amount = data.get('vnp_Amount')
        vnp_response_code = data.get('vnp_ResponseCode')
        vnp_transaction_no = data.get('vnp_TransactionNo')
        vnp_secure_hash = data.get('vnp_SecureHash')
        
        # Verify signature
        vnp_hash_secret = getattr(settings, 'VNPAY_HASH_SECRET', 'BOSNIANCUSMTW3IAGVXG9K7AYGVC9W1N')
        
        # Remove secure hash from params for verification
        input_data = {k: v for k, v in data.items() if k != 'vnp_SecureHash' and k != 'vnp_SecureHashType'}
        sorted_params = sorted(input_data.items())
        hash_data = '&'.join([f"{k}={v}" for k, v in sorted_params])
        expected_signature = hmac.new(
            vnp_hash_secret.encode('utf-8'), 
            hash_data.encode('utf-8'), 
            hashlib.sha256
        ).hexdigest()
        
        # Extract payment ID from txn_ref (format: ORDER_{payment_id}_{timestamp})
        payment_id = vnp_txn_ref.split('_')[1] if '_' in vnp_txn_ref else None
        if not payment_id:
            return Response({'error': 'Invalid transaction reference'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        payment = Payment.objects.get(id=payment_id)
        
        if vnp_response_code == '00':
            # Payment successful
            payment.status = 'completed'
            payment.transaction_id = vnp_transaction_no
            payment.paid_at = timezone.now()
            payment.gateway_response = dict(data)
            payment.save()
            
            # Update order
            payment.order.payment_status = 'paid'
            payment.order.save()
            
            return Response({
                'RspCode': '00',
                'Message': 'Confirm Success'
            })
        else:
            # Payment failed
            payment.status = 'failed'
            payment.gateway_response = dict(data)
            payment.save()
            
            return Response({
                'RspCode': vnp_response_code,
                'Message': 'Payment failed'
            })
            
    except Payment.DoesNotExist:
        return Response({'error': 'Payment not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

# ==================== PAYMENT METHOD VIEWS ====================

class PaymentMethodListView(generics.ListAPIView):
    queryset = PaymentMethod.objects.filter(is_active=True)
    serializer_class = PaymentMethodSerializer
    permission_classes = [permissions.AllowAny]

class PaymentMethodDetailView(generics.RetrieveAPIView):
    queryset = PaymentMethod.objects.filter(is_active=True)
    serializer_class = PaymentMethodSerializer
    permission_classes = [permissions.AllowAny]
