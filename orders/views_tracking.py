"""
Order tracking and search endpoints
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import permissions, status
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q, Count

from .models import Order, OrderTracking
from .serializers import OrderSerializer, OrderTrackingSerializer


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def track_order_by_number(request):
    """
    Track order by order number - no authentication required
    Query params: order_number, phone (for verification)
    """
    order_number = request.query_params.get('order_number')
    phone = request.query_params.get('phone')
    
    if not order_number:
        return Response({
            'error': 'Vui lòng nhập mã đơn hàng'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Find order by order number
        order = Order.objects.get(order_number=order_number)
        
        # Verify phone number for security
        if phone and order.delivery_phone != phone:
            return Response({
                'error': 'Số điện thoại không khớp với đơn hàng'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get tracking history
        tracking = order.tracking.all().order_by('created_at')
        
        return Response({
            'success': True,
            'order': OrderSerializer(order).data,
            'tracking': OrderTrackingSerializer(tracking, many=True).data
        })
        
    except Order.DoesNotExist:
        return Response({
            'error': 'Không tìm thấy đơn hàng với mã này'
        }, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_today_orders_count(request):
    """
    Get today's order count for customer
    """
    user = request.user
    today = timezone.now().date()
    tomorrow = today + timedelta(days=1)
    
    # Count orders created today
    today_orders = Order.objects.filter(
        customer=user,
        created_at__gte=today,
        created_at__lt=tomorrow
    )
    
    count = today_orders.count()
    
    # Group by status
    status_counts = {}
    for order_status in ['unpaid', 'pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering', 'delivered', 'completed', 'cancelled']:
        status_count = today_orders.filter(status=order_status).count()
        if status_count > 0:
            status_counts[order_status] = status_count
    
    return Response({
        'success': True,
        'date': today.isoformat(),
        'total_orders': count,
        'status_breakdown': status_counts,
        'orders': OrderSerializer(today_orders.order_by('-created_at'), many=True).data
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_unread_notifications_count(request):
    """
    Get unread notifications count for user
    This is a placeholder - implement based on your notification system
    """
    user = request.user
    
    # Count orders that need attention
    unread_count = 0
    
    if hasattr(user, 'user_type'):
        if user.user_type == 'customer':
            # Orders with status updates
            unread_count = Order.objects.filter(
                customer=user,
                status__in=['confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering', 'delivered']
            ).count()
        
        elif user.user_type == 'seller':
            # New orders waiting for confirmation
            from restaurants.models import Restaurant
            restaurants = Restaurant.objects.filter(owner=user)
            unread_count = Order.objects.filter(
                restaurant__in=restaurants,
                status='pending'
            ).count()
        
        elif user.user_type == 'shipper':
            # Available orders to accept
            unread_count = Order.objects.filter(
                status='ready',
                shipper__isnull=True
            ).count()
    
    return Response({
        'success': True,
        'unread_count': unread_count
    })
