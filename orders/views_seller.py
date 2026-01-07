"""
Seller order management and statistics views
Fixed version with proper date filtering and analytics
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import permissions, status
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import datetime, timedelta
from django.db.models import Sum, Count, Avg, F, DecimalField
from django.db.models.functions import TruncHour, TruncDay, TruncMonth, TruncWeek, Coalesce
from decimal import Decimal

from .models import Order, OrderItem, OrderTracking
from .serializers import OrderSerializer, SellerOrderSerializer
from restaurants.models import Restaurant, Food


# Platform fee rate
PLATFORM_FEE_RATE = Decimal('0.15')  # 15%


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def seller_dashboard(request):
    """
    Seller dashboard with comprehensive statistics
    Supports custom date range selection
    
    Query params:
    - start_date: YYYY-MM-DD (default: all time)
    - end_date: YYYY-MM-DD (default: today)
    - period: day/week/month/year/all (alternative to custom dates)
    """
    user = request.user
    
    # Get restaurant
    try:
        restaurant = Restaurant.objects.get(owner=user)
    except Restaurant.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Bạn chưa có nhà hàng'
        }, status=status.HTTP_404_NOT_FOUND)
    
    # Parse date parameters
    now = timezone.now()
    today = now.date()
    
    start_date_str = request.query_params.get('start_date')
    end_date_str = request.query_params.get('end_date')
    period = request.query_params.get('period', 'all')  # Default to 'all' to show all data
    
    # Custom date range takes priority
    if start_date_str and end_date_str:
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
            # Make end_date inclusive
            end_date = end_date + timedelta(days=1)
        except ValueError:
            return Response({
                'success': False,
                'error': 'Định dạng ngày không hợp lệ. Sử dụng YYYY-MM-DD'
            }, status=status.HTTP_400_BAD_REQUEST)
    else:
        # Use period-based calculation
        if period == 'day':
            start_date = today
            end_date = today + timedelta(days=1)
        elif period == 'week':
            start_date = today - timedelta(days=today.weekday())
            end_date = start_date + timedelta(days=7)
        elif period == 'month':
            start_date = today.replace(day=1)
            if today.month == 12:
                end_date = today.replace(year=today.year + 1, month=1, day=1)
            else:
                end_date = today.replace(month=today.month + 1, day=1)
        elif period == 'year':
            start_date = today.replace(month=1, day=1)
            end_date = today.replace(year=today.year + 1, month=1, day=1)
        elif period == 'all':
            # All time - from beginning of 2020 to tomorrow
            start_date = datetime(2020, 1, 1).date()
            end_date = today + timedelta(days=1)
        else:
            # Default to all time
            start_date = datetime(2020, 1, 1).date()
            end_date = today + timedelta(days=1)
    
    # Convert to datetime for filtering
    start_datetime = timezone.make_aware(datetime.combine(start_date, datetime.min.time()))
    end_datetime = timezone.make_aware(datetime.combine(end_date, datetime.min.time()))
    
    # Get orders in date range
    period_orders = Order.objects.filter(
        restaurant=restaurant,
        created_at__gte=start_datetime,
        created_at__lt=end_datetime
    )
    
    # Completed orders (for actual revenue) - only paid orders
    completed_orders = period_orders.filter(
        status__in=['completed', 'delivered'],
        payment_status='paid'
    )
    
    # All non-cancelled orders (for potential revenue)
    active_orders = period_orders.exclude(status='cancelled')
    
    # Calculate ACTUAL revenue (paid orders only)
    actual_subtotal = completed_orders.aggregate(
        total=Coalesce(Sum('subtotal'), Decimal('0'))
    )['total']
    
    actual_delivery_fee = completed_orders.aggregate(
        total=Coalesce(Sum('delivery_fee'), Decimal('0'))
    )['total']
    
    actual_platform_fee = actual_subtotal * PLATFORM_FEE_RATE
    actual_revenue = actual_subtotal - actual_platform_fee
    
    # Calculate POTENTIAL revenue (all non-cancelled orders)
    potential_subtotal = active_orders.aggregate(
        total=Coalesce(Sum('subtotal'), Decimal('0'))
    )['total']
    
    potential_platform_fee = potential_subtotal * PLATFORM_FEE_RATE
    potential_revenue = potential_subtotal - potential_platform_fee
    
    # Total delivery fees
    total_delivery_fee = active_orders.aggregate(
        total=Coalesce(Sum('delivery_fee'), Decimal('0'))
    )['total']
    
    # Order counts by status
    total_orders = period_orders.count()
    status_counts = {}
    for order_status, _ in Order.STATUS_CHOICES:
        count = period_orders.filter(status=order_status).count()
        if count > 0:
            status_counts[order_status] = count
    
    completed_count = completed_orders.count()
    active_count = active_orders.count()
    cancelled_count = period_orders.filter(status='cancelled').count()
    pending_count = period_orders.filter(status='pending').count()
    
    # Average order value (based on all active orders)
    avg_order_value = Decimal('0')
    if active_count > 0:
        avg_order_value = potential_subtotal / active_count
    
    # Top selling items (from all active orders, not just completed)
    top_items = OrderItem.objects.filter(
        order__in=active_orders
    ).values(
        'food__id', 'food__name', 'food__image'
    ).annotate(
        quantity_sold=Sum('quantity'),
        revenue=Sum(F('price') * F('quantity'), output_field=DecimalField())
    ).order_by('-quantity_sold')[:10]
    
    # Calculate previous period for comparison
    period_days = (end_date - start_date).days
    prev_start = start_date - timedelta(days=period_days)
    prev_end = start_date
    
    prev_start_datetime = timezone.make_aware(datetime.combine(prev_start, datetime.min.time()))
    prev_end_datetime = timezone.make_aware(datetime.combine(prev_end, datetime.min.time()))
    
    prev_orders = Order.objects.filter(
        restaurant=restaurant,
        created_at__gte=prev_start_datetime,
        created_at__lt=prev_end_datetime,
        status__in=['completed', 'delivered'],
        payment_status='paid'
    )
    
    prev_subtotal = prev_orders.aggregate(
        total=Coalesce(Sum('subtotal'), Decimal('0'))
    )['total']
    prev_revenue = prev_subtotal * (Decimal('1') - PLATFORM_FEE_RATE)
    prev_count = prev_orders.count()
    
    # Growth percentages
    revenue_growth = Decimal('0')
    if prev_revenue > 0:
        revenue_growth = ((actual_revenue - prev_revenue) / prev_revenue) * 100
    
    order_growth = Decimal('0')
    if prev_count > 0:
        order_growth = ((Decimal(completed_count) - Decimal(prev_count)) / Decimal(prev_count)) * 100
    
    # Chart data - simplified for 'all' period
    chart_labels = []
    chart_values = []
    
    days_in_period = (end_date - start_date).days
    
    # For 'all' period or very long periods, show summary only (avoid complex date queries)
    if period == 'all' or days_in_period > 365:
        # Simple summary - just show total
        chart_labels = ['Tổng']
        total_revenue = float(potential_subtotal * (Decimal('1') - PLATFORM_FEE_RATE))
        chart_values = [total_revenue]
            
    elif days_in_period <= 1:
        # Hourly breakdown for single day
        for hour in range(24):
            chart_labels.append(f"{hour}:00")
            hour_start = start_datetime + timedelta(hours=hour)
            hour_end = hour_start + timedelta(hours=1)
            
            hour_revenue = active_orders.filter(
                created_at__gte=hour_start,
                created_at__lt=hour_end
            ).aggregate(total=Coalesce(Sum('subtotal'), Decimal('0')))['total']
            
            chart_values.append(float(hour_revenue * (Decimal('1') - PLATFORM_FEE_RATE)))
    elif days_in_period <= 31:
        # Daily breakdown
        for i in range(days_in_period):
            day = start_date + timedelta(days=i)
            chart_labels.append(day.strftime('%d/%m'))
            
            day_start = timezone.make_aware(datetime.combine(day, datetime.min.time()))
            day_end = day_start + timedelta(days=1)
            
            day_revenue = active_orders.filter(
                created_at__gte=day_start,
                created_at__lt=day_end
            ).aggregate(total=Coalesce(Sum('subtotal'), Decimal('0')))['total']
            
            chart_values.append(float(day_revenue * (Decimal('1') - PLATFORM_FEE_RATE)))
    else:
        # Monthly breakdown for medium periods (32-365 days)
        current = start_date.replace(day=1)
        while current < end_date:
            chart_labels.append(current.strftime('%m/%Y'))
            
            month_start = timezone.make_aware(datetime.combine(current, datetime.min.time()))
            if current.month == 12:
                next_month = current.replace(year=current.year + 1, month=1, day=1)
            else:
                next_month = current.replace(month=current.month + 1, day=1)
            month_end = timezone.make_aware(datetime.combine(next_month, datetime.min.time()))
            
            month_revenue = active_orders.filter(
                created_at__gte=month_start,
                created_at__lt=month_end
            ).aggregate(total=Coalesce(Sum('subtotal'), Decimal('0')))['total']
            
            chart_values.append(float(month_revenue * (Decimal('1') - PLATFORM_FEE_RATE)))
            current = next_month
    
    # Recent orders
    recent_orders = Order.objects.filter(
        restaurant=restaurant
    ).order_by('-created_at')[:10]
    
    # Pending orders that need attention
    pending_orders = Order.objects.filter(
        restaurant=restaurant,
        status='pending'
    ).order_by('-created_at')
    
    return Response({
        'success': True,
        'restaurant': {
            'id': restaurant.id,
            'name': restaurant.name,
        },
        'date_range': {
            'start': start_date.isoformat(),
            'end': (end_date - timedelta(days=1)).isoformat(),
            'period': period,
            'days': days_in_period
        },
        'revenue': {
            # Actual revenue (paid orders only)
            'actual_sales': float(actual_subtotal),
            'actual_platform_fee': float(actual_platform_fee),
            'actual_net_revenue': float(actual_revenue),
            # Potential revenue (all non-cancelled orders)
            'potential_sales': float(potential_subtotal),
            'potential_platform_fee': float(potential_platform_fee),
            'potential_net_revenue': float(potential_revenue),
            # Common
            'platform_fee_rate': float(PLATFORM_FEE_RATE * 100),
            'delivery_fees': float(total_delivery_fee),
            # Legacy fields for backward compatibility
            'total_sales': float(potential_subtotal),
            'platform_fee': float(potential_platform_fee),
            'net_revenue': float(potential_revenue),
        },
        'orders': {
            'total': total_orders,
            'active': active_count,
            'completed': completed_count,
            'cancelled': cancelled_count,
            'pending': pending_count,
            'by_status': status_counts,
        },
        'metrics': {
            'avg_order_value': float(avg_order_value) if avg_order_value else 0,
            'revenue_growth': float(revenue_growth) if revenue_growth else 0,
            'order_growth': float(order_growth) if order_growth else 0,
        },
        'comparison': {
            'prev_period': {
                'start': prev_start.isoformat(),
                'end': (prev_end - timedelta(days=1)).isoformat(),
            },
            'prev_revenue': float(prev_revenue) if prev_revenue else 0,
            'prev_orders': prev_count,
        },
        'top_selling_items': list(top_items),
        'chart': {
            'labels': chart_labels,
            'values': chart_values,
        },
        'recent_orders': SellerOrderSerializer(recent_orders, many=True).data,
        'pending_orders': SellerOrderSerializer(pending_orders, many=True).data,
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def seller_orders_by_status(request, status_code):
    """
    Get seller orders filtered by status
    """
    user = request.user
    
    try:
        restaurant = Restaurant.objects.get(owner=user)
    except Restaurant.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Bạn chưa có nhà hàng'
        }, status=status.HTTP_404_NOT_FOUND)
    
    # Validate status
    valid_statuses = [s[0] for s in Order.STATUS_CHOICES]
    if status_code not in valid_statuses:
        return Response({
            'success': False,
            'error': f'Trạng thái không hợp lệ. Các trạng thái: {", ".join(valid_statuses)}'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    orders = Order.objects.filter(
        restaurant=restaurant,
        status=status_code
    ).order_by('-created_at')
    
    return Response({
        'success': True,
        'status': status_code,
        'count': orders.count(),
        'orders': SellerOrderSerializer(orders, many=True).data
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def seller_update_order(request, order_id):
    """
    Seller updates order status - STRICT flow
    
    Allowed transitions:
    - pending → confirmed (Nhận đơn)
    - confirmed → preparing (Bắt đầu chuẩn bị)
    - preparing → ready (Món đã xong)
    
    CANNOT skip steps!
    """
    user = request.user
    
    try:
        restaurant = Restaurant.objects.get(owner=user)
    except Restaurant.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Bạn chưa có nhà hàng'
        }, status=status.HTTP_404_NOT_FOUND)
    
    # Get order
    order = get_object_or_404(Order, id=order_id, restaurant=restaurant)
    
    # Get requested action
    action = request.data.get('action')
    
    # Define strict transitions
    ACTIONS = {
        'confirm': {
            'from': 'pending',
            'to': 'confirmed',
            'message': 'Nhà hàng đã nhận đơn hàng'
        },
        'start_preparing': {
            'from': 'confirmed',
            'to': 'preparing',
            'message': 'Nhà hàng đang chuẩn bị món ăn'
        },
        'mark_ready': {
            'from': 'preparing',
            'to': 'ready',
            'message': 'Món ăn đã sẵn sàng, đang tìm shipper'
        },
        'cancel': {
            'from': ['pending', 'confirmed', 'preparing'],
            'to': 'cancelled',
            'message': 'Đơn hàng đã bị hủy bởi nhà hàng'
        }
    }
    
    if action not in ACTIONS:
        return Response({
            'success': False,
            'error': f'Hành động không hợp lệ. Các hành động: {", ".join(ACTIONS.keys())}'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    action_config = ACTIONS[action]
    
    # Check current status
    if action == 'cancel':
        if order.status not in action_config['from']:
            return Response({
                'success': False,
                'error': f'Không thể hủy đơn ở trạng thái "{order.get_status_display()}"'
            }, status=status.HTTP_400_BAD_REQUEST)
    else:
        if order.status != action_config['from']:
            return Response({
                'success': False,
                'error': f'Không thể thực hiện "{action}" khi đơn đang ở trạng thái "{order.get_status_display()}". '
                         f'Đơn phải ở trạng thái "{action_config["from"]}"'
            }, status=status.HTTP_400_BAD_REQUEST)
    
    # Update order
    old_status = order.status
    order.status = action_config['to']
    order.save()
    
    # Create tracking record
    OrderTracking.objects.create(
        order=order,
        status=action_config['to'],
        message=action_config['message'],
        created_at=timezone.now()
    )
    
    return Response({
        'success': True,
        'message': action_config['message'],
        'order': SellerOrderSerializer(order).data,
        'transition': {
            'from': old_status,
            'to': action_config['to'],
            'action': action
        }
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def seller_update_food_quantity(request, food_id):
    """
    Seller updates food item quantity/availability
    """
    user = request.user
    
    try:
        restaurant = Restaurant.objects.get(owner=user)
    except Restaurant.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Bạn chưa có nhà hàng'
        }, status=status.HTTP_404_NOT_FOUND)
    
    # Get food item
    food = get_object_or_404(Food, id=food_id, restaurant=restaurant)
    
    # Get update data
    quantity = request.data.get('quantity')
    is_available = request.data.get('is_available')
    
    if quantity is not None:
        try:
            food.quantity = int(quantity)
        except (ValueError, TypeError):
            return Response({
                'success': False,
                'error': 'Số lượng phải là số nguyên'
            }, status=status.HTTP_400_BAD_REQUEST)
    
    if is_available is not None:
        food.is_available = bool(is_available)
    
    food.save()
    
    return Response({
        'success': True,
        'message': 'Đã cập nhật món ăn',
        'food': {
            'id': food.id,
            'name': food.name,
            'quantity': getattr(food, 'quantity', None),
            'is_available': food.is_available,
        }
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def seller_food_inventory(request):
    """
    Get all food items with inventory status
    """
    user = request.user
    
    try:
        restaurant = Restaurant.objects.get(owner=user)
    except Restaurant.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Bạn chưa có nhà hàng'
        }, status=status.HTTP_404_NOT_FOUND)
    
    foods = Food.objects.filter(restaurant=restaurant)
    
    inventory = []
    for food in foods:
        inventory.append({
            'id': food.id,
            'name': food.name,
            'price': float(food.price),
            'discount_price': float(food.discount_price) if food.discount_price else None,
            'quantity': getattr(food, 'quantity', None),
            'is_available': food.is_available,
            'image': food.image.url if food.image else None,
        })
    
    return Response({
        'success': True,
        'restaurant': restaurant.name,
        'total_items': len(inventory),
        'available_items': len([f for f in inventory if f['is_available']]),
        'inventory': inventory
    })
