"""
Customer order views - including guest order confirmation
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import permissions, status
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import Order, OrderTracking
from .serializers import OrderSerializer, CustomerOrderSerializer


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def guest_confirm_delivery(request):
    """
    Guest (không đăng nhập) xác nhận đã nhận hàng
    
    Required:
    - order_number: Mã đơn hàng
    - phone: Số điện thoại đặt hàng (để xác thực)
    
    Logic giống Shopee Food:
    - Khách không cần đăng nhập
    - Xác thực bằng mã đơn + SĐT
    - Chỉ xác nhận được khi đơn ở trạng thái 'delivered'
    """
    order_number = request.data.get('order_number')
    phone = request.data.get('phone')
    
    if not order_number or not phone:
        return Response({
            'success': False,
            'error': 'Vui lòng cung cấp mã đơn hàng và số điện thoại'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Find order
    try:
        order = Order.objects.get(order_number=order_number)
    except Order.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Không tìm thấy đơn hàng với mã này'
        }, status=status.HTTP_404_NOT_FOUND)
    
    # Verify phone
    if order.delivery_phone != phone:
        return Response({
            'success': False,
            'error': 'Số điện thoại không khớp với đơn hàng'
        }, status=status.HTTP_403_FORBIDDEN)
    
    # Check status
    if order.status != 'delivered':
        status_display = order.get_status_display()
        return Response({
            'success': False,
            'error': f'Không thể xác nhận. Đơn hàng đang ở trạng thái: {status_display}'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Update to completed
    order.status = 'completed'
    order.save()
    
    # Update payment status for COD
    if hasattr(order, 'payment') and order.payment.payment_method == 'cash':
        order.payment.status = 'completed'
        order.payment.paid_at = timezone.now()
        order.payment.save()
        order.payment_status = 'paid'
        order.save()
    
    # Create tracking record
    OrderTracking.objects.create(
        order=order,
        status='completed',
        message='Khách hàng đã xác nhận nhận hàng thành công',
        created_at=timezone.now()
    )
    
    return Response({
        'success': True,
        'message': 'Đã xác nhận nhận hàng thành công!',
        'order': CustomerOrderSerializer(order).data
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def customer_confirm_delivery(request, order_id):
    """
    Customer (đã đăng nhập) xác nhận đã nhận hàng
    
    Logic:
    - Chỉ customer của đơn hàng mới được xác nhận
    - Đơn phải ở trạng thái 'delivered'
    - Sau khi xác nhận → 'completed'
    - Nếu COD → cập nhật payment status
    """
    user = request.user
    
    order = get_object_or_404(Order, id=order_id, customer=user)
    
    if order.status != 'delivered':
        return Response({
            'success': False,
            'error': f'Không thể xác nhận. Đơn hàng đang ở trạng thái: {order.get_status_display()}'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Update to completed
    order.status = 'completed'
    order.save()
    
    # Update payment status for COD
    if hasattr(order, 'payment') and order.payment.payment_method == 'cash':
        order.payment.status = 'completed'
        order.payment.paid_at = timezone.now()
        order.payment.save()
        order.payment_status = 'paid'
        order.save()
    
    # Create tracking record
    OrderTracking.objects.create(
        order=order,
        status='completed',
        message='Khách hàng đã xác nhận nhận hàng thành công',
        created_at=timezone.now()
    )
    
    return Response({
        'success': True,
        'message': 'Đã xác nhận nhận hàng thành công!',
        'order': CustomerOrderSerializer(order).data
    })


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def get_order_status_flow(request):
    """
    Trả về flow trạng thái đơn hàng để frontend hiển thị
    """
    flow = [
        {
            'status': 'unpaid',
            'label': 'Chưa thanh toán',
            'description': 'Đơn hàng chờ thanh toán online',
            'icon': 'wallet-outline',
            'color': '#FFA500'
        },
        {
            'status': 'pending',
            'label': 'Chờ xác nhận',
            'description': 'Đơn hàng đang chờ nhà hàng xác nhận',
            'icon': 'time-outline',
            'color': '#3498db'
        },
        {
            'status': 'confirmed',
            'label': 'Đã xác nhận',
            'description': 'Nhà hàng đã nhận đơn',
            'icon': 'checkmark-circle-outline',
            'color': '#2ecc71'
        },
        {
            'status': 'preparing',
            'label': 'Đang chuẩn bị',
            'description': 'Nhà hàng đang chuẩn bị món ăn',
            'icon': 'restaurant-outline',
            'color': '#9b59b6'
        },
        {
            'status': 'ready',
            'label': 'Sẵn sàng giao',
            'description': 'Món ăn đã xong, đang tìm shipper',
            'icon': 'bag-check-outline',
            'color': '#1abc9c'
        },
        {
            'status': 'assigned',
            'label': 'Đã giao shipper',
            'description': 'Shipper đã nhận đơn',
            'icon': 'bicycle-outline',
            'color': '#e74c3c'
        },
        {
            'status': 'picked_up',
            'label': 'Đã lấy hàng',
            'description': 'Shipper đã lấy hàng từ nhà hàng',
            'icon': 'cube-outline',
            'color': '#f39c12'
        },
        {
            'status': 'delivering',
            'label': 'Đang giao',
            'description': 'Shipper đang trên đường giao hàng',
            'icon': 'navigate-outline',
            'color': '#e67e22'
        },
        {
            'status': 'delivered',
            'label': 'Đã giao hàng',
            'description': 'Đơn hàng đã được giao, chờ xác nhận',
            'icon': 'location-outline',
            'color': '#27ae60'
        },
        {
            'status': 'completed',
            'label': 'Hoàn thành',
            'description': 'Đơn hàng đã hoàn thành',
            'icon': 'checkmark-done-outline',
            'color': '#2ecc71'
        },
        {
            'status': 'cancelled',
            'label': 'Đã hủy',
            'description': 'Đơn hàng đã bị hủy',
            'icon': 'close-circle-outline',
            'color': '#e74c3c'
        }
    ]
    
    return Response({
        'success': True,
        'flow': flow,
        'transitions': {
            'customer': {
                'delivered': ['completed']
            },
            'seller': {
                'pending': ['confirmed'],
                'confirmed': ['preparing'],
                'preparing': ['ready']
            },
            'shipper': {
                'ready': ['assigned'],
                'assigned': ['picked_up'],
                'picked_up': ['delivering'],
                'delivering': ['delivered']
            }
        }
    })
