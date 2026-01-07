"""
Revenue and statistics calculation with platform fee
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import permissions, status
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import timedelta
from django.db.models import Sum, Count, Q, F, DecimalField
from django.db.models.functions import TruncHour, TruncDay, TruncMonth, Coalesce
from decimal import Decimal

from .models import Order, OrderItem
from restaurants.models import Restaurant


# Platform settings
PLATFORM_FEE_RATE = Decimal('0.15')  # 15% platform fee


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def restaurant_stats_fixed(request):
    """
    Fixed restaurant statistics with accurate revenue calculation
    Platform fee: 15% of subtotal
    Restaurant revenue = subtotal - platform_fee
    """
    user = request.user
    restaurant = get_object_or_404(Restaurant, owner=user)
    
    period = request.query_params.get('period', 'day')
    now = timezone.now()
    today = now.date()
    
    # Calculate date range based on period
    if period == 'day':
        start_date = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.min.time()))
        end_date = start_date + timedelta(days=1)
    elif period == 'week':
        start_date = timezone.make_aware(timezone.datetime.combine(today - timedelta(days=today.weekday()), timezone.datetime.min.time()))
        end_date = start_date + timedelta(days=7)
    elif period == 'month':
        start_date = timezone.make_aware(timezone.datetime.combine(today.replace(day=1), timezone.datetime.min.time()))
        if today.month == 12:
            end_date = timezone.make_aware(timezone.datetime.combine(today.replace(year=today.year + 1, month=1, day=1), timezone.datetime.min.time()))
        else:
            end_date = timezone.make_aware(timezone.datetime.combine(today.replace(month=today.month + 1, day=1), timezone.datetime.min.time()))
    elif period == 'year':
        start_date = timezone.make_aware(timezone.datetime.combine(today.replace(month=1, day=1), timezone.datetime.min.time()))
        end_date = timezone.make_aware(timezone.datetime.combine(today.replace(year=today.year + 1, month=1, day=1), timezone.datetime.min.time()))
    else:
        start_date = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.min.time()))
        end_date = start_date + timedelta(days=1)
    
    # Get completed/delivered orders for revenue (only paid orders)
    completed_orders = Order.objects.filter(
        restaurant=restaurant,
        created_at__gte=start_date,
        created_at__lt=end_date,
        status__in=['completed', 'delivered'],
        payment_status='paid'
    )
    
    # Get all orders for the period (for order counts)
    all_period_orders = Order.objects.filter(
        restaurant=restaurant,
        created_at__gte=start_date,
        created_at__lt=end_date
    )
    
    # Calculate revenue with platform fee
    total_subtotal = completed_orders.aggregate(
        total=Coalesce(Sum('subtotal'), Decimal('0'))
    )['total']
    
    total_delivery_fee = completed_orders.aggregate(
        total=Coalesce(Sum('delivery_fee'), Decimal('0'))
    )['total']
    
    # Platform fee calculation
    platform_fee = total_subtotal * PLATFORM_FEE_RATE
    restaurant_revenue = total_subtotal - platform_fee
    
    # Order counts
    total_orders = all_period_orders.count()
    completed_count = completed_orders.count()
    cancelled_count = all_period_orders.filter(status='cancelled').count()
    pending_count = all_period_orders.filter(status='pending').count()
    preparing_count = all_period_orders.filter(status='preparing').count()
    
    # Average order value
    avg_order_value = Decimal('0')
    if completed_count > 0:
        avg_order_value = total_subtotal / completed_count
    
    # Top selling items
    top_selling_items = OrderItem.objects.filter(
        order__in=completed_orders
    ).values('food__name', 'food__id').annotate(
        quantity_sold=Sum('quantity'),
        revenue=Sum(F('price') * F('quantity'), output_field=DecimalField())
    ).order_by('-quantity_sold')[:10]
    
    # Status counts (all time for this restaurant)
    status_counts = Order.objects.filter(restaurant=restaurant).values('status').annotate(count=Count('id'))
    counts = {item['status']: item['count'] for item in status_counts}
    counts['total'] = sum(counts.values())
    
    # Chart data - revenue by time
    chart_labels = []
    chart_values = []
    
    if period == 'day':
        # Hourly breakdown
        for i in range(24):
            chart_labels.append(f"{i}h")
            hour_start = start_date + timedelta(hours=i)
            hour_end = hour_start + timedelta(hours=1)
            
            hour_revenue = completed_orders.filter(
                created_at__gte=hour_start,
                created_at__lt=hour_end
            ).aggregate(total=Coalesce(Sum('subtotal'), Decimal('0')))['total']
            
            # Subtract platform fee
            hour_net = hour_revenue * (Decimal('1') - PLATFORM_FEE_RATE)
            chart_values.append(float(hour_net))
            
    elif period == 'week':
        # Daily breakdown for week
        days = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
        for i in range(7):
            chart_labels.append(days[i])
            day_start = start_date + timedelta(days=i)
            day_end = day_start + timedelta(days=1)
            
            day_revenue = completed_orders.filter(
                created_at__gte=day_start,
                created_at__lt=day_end
            ).aggregate(total=Coalesce(Sum('subtotal'), Decimal('0')))['total']
            
            day_net = day_revenue * (Decimal('1') - PLATFORM_FEE_RATE)
            chart_values.append(float(day_net))
            
    elif period == 'month':
        # Daily breakdown for month
        days_in_month = (end_date - start_date).days
        for i in range(min(days_in_month, 31)):
            day_date = start_date + timedelta(days=i)
            chart_labels.append(str(day_date.day))
            day_end = day_date + timedelta(days=1)
            
            day_revenue = completed_orders.filter(
                created_at__gte=day_date,
                created_at__lt=day_end
            ).aggregate(total=Coalesce(Sum('subtotal'), Decimal('0')))['total']
            
            day_net = day_revenue * (Decimal('1') - PLATFORM_FEE_RATE)
            chart_values.append(float(day_net))
            
    else:  # year
        # Monthly breakdown
        months = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12']
        for i in range(12):
            chart_labels.append(months[i])
            month_start = timezone.make_aware(timezone.datetime.combine(today.replace(month=i+1, day=1), timezone.datetime.min.time()))
            if i == 11:
                month_end = timezone.make_aware(timezone.datetime.combine(today.replace(year=today.year + 1, month=1, day=1), timezone.datetime.min.time()))
            else:
                month_end = timezone.make_aware(timezone.datetime.combine(today.replace(month=i+2, day=1), timezone.datetime.min.time()))
            
            month_revenue = completed_orders.filter(
                created_at__gte=month_start,
                created_at__lt=month_end
            ).aggregate(total=Coalesce(Sum('subtotal'), Decimal('0')))['total']
            
            month_net = month_revenue * (Decimal('1') - PLATFORM_FEE_RATE)
            chart_values.append(float(month_net))
    
    # Comparison with previous period
    if period == 'day':
        prev_start = start_date - timedelta(days=1)
        prev_end = start_date
    elif period == 'week':
        prev_start = start_date - timedelta(days=7)
        prev_end = start_date
    elif period == 'month':
        if start_date.month == 1:
            prev_start = timezone.make_aware(timezone.datetime.combine(start_date.replace(year=start_date.year - 1, month=12, day=1), timezone.datetime.min.time()))
        else:
            prev_start = timezone.make_aware(timezone.datetime.combine(start_date.replace(month=start_date.month - 1, day=1), timezone.datetime.min.time()))
        prev_end = start_date
    else:
        prev_start = timezone.make_aware(timezone.datetime.combine(start_date.replace(year=start_date.year - 1, month=1, day=1), timezone.datetime.min.time()))
        prev_end = start_date
    
    prev_orders = Order.objects.filter(
        restaurant=restaurant,
        created_at__gte=prev_start,
        created_at__lt=prev_end,
        status__in=['completed', 'delivered'],
        payment_status='paid'
    )
    
    prev_subtotal = prev_orders.aggregate(total=Coalesce(Sum('subtotal'), Decimal('0')))['total']
    prev_revenue = prev_subtotal * (Decimal('1') - PLATFORM_FEE_RATE)
    prev_order_count = prev_orders.count()
    
    # Calculate growth percentages
    revenue_growth = Decimal('0')
    if prev_revenue > 0:
        revenue_growth = ((restaurant_revenue - prev_revenue) / prev_revenue) * 100
    
    order_growth = Decimal('0')
    if prev_order_count > 0:
        order_growth = ((completed_count - prev_order_count) / Decimal(prev_order_count)) * 100
    
    # Recent orders summary
    recent_orders = Order.objects.filter(
        restaurant=restaurant
    ).order_by('-created_at')[:5].values(
        'id', 'order_number', 'status', 'subtotal', 'total_amount', 'created_at',
        'customer__first_name', 'customer__last_name', 'customer__email'
    )
    
    return Response({
        'success': True,
        'period': period,
        'date_range': {
            'start': start_date.isoformat(),
            'end': end_date.isoformat()
        },
        'revenue': {
            'total_subtotal': float(total_subtotal),
            'platform_fee': float(platform_fee),
            'platform_fee_rate': float(PLATFORM_FEE_RATE * 100),  # as percentage
            'restaurant_revenue': float(restaurant_revenue),
            'delivery_fee_total': float(total_delivery_fee),
        },
        'orders': {
            'total': total_orders,
            'completed': completed_count,
            'cancelled': cancelled_count,
            'pending': pending_count,
            'preparing': preparing_count,
        },
        'avg_order_value': float(avg_order_value),
        'revenue_growth': float(revenue_growth),
        'order_growth': float(order_growth),
        'top_selling_items': list(top_selling_items),
        'status_counts': counts,
        'chart_data': {
            'labels': chart_labels,
            'values': chart_values
        },
        'recent_orders': list(recent_orders),
        'comparison': {
            'prev_revenue': float(prev_revenue),
            'prev_orders': prev_order_count
        }
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def shipper_earnings(request):
    """
    Calculate shipper earnings
    Shipper gets: delivery_fee for each completed order
    """
    user = request.user
    
    if not hasattr(user, 'user_type') or user.user_type != 'shipper':
        return Response({
            'error': 'Chỉ shipper mới có thể xem thu nhập'
        }, status=status.HTTP_403_FORBIDDEN)
    
    period = request.query_params.get('period', 'day')
    now = timezone.now()
    today = now.date()
    
    # Calculate date range
    if period == 'day':
        start_date = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.min.time()))
        end_date = start_date + timedelta(days=1)
    elif period == 'week':
        start_date = timezone.make_aware(timezone.datetime.combine(today - timedelta(days=today.weekday()), timezone.datetime.min.time()))
        end_date = start_date + timedelta(days=7)
    elif period == 'month':
        start_date = timezone.make_aware(timezone.datetime.combine(today.replace(day=1), timezone.datetime.min.time()))
        if today.month == 12:
            end_date = timezone.make_aware(timezone.datetime.combine(today.replace(year=today.year + 1, month=1, day=1), timezone.datetime.min.time()))
        else:
            end_date = timezone.make_aware(timezone.datetime.combine(today.replace(month=today.month + 1, day=1), timezone.datetime.min.time()))
    else:
        start_date = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.min.time()))
        end_date = start_date + timedelta(days=1)
    
    # Get completed deliveries
    completed_deliveries = Order.objects.filter(
        shipper=user,
        created_at__gte=start_date,
        created_at__lt=end_date,
        status='completed',
        payment_status='paid'
    )
    
    # Calculate earnings
    total_earnings = completed_deliveries.aggregate(
        total=Coalesce(Sum('delivery_fee'), Decimal('0'))
    )['total']
    
    total_deliveries = completed_deliveries.count()
    
    # All deliveries in period
    all_deliveries = Order.objects.filter(
        shipper=user,
        created_at__gte=start_date,
        created_at__lt=end_date
    )
    
    return Response({
        'success': True,
        'period': period,
        'total_earnings': float(total_earnings),
        'total_deliveries': total_deliveries,
        'avg_per_delivery': float(total_earnings / total_deliveries) if total_deliveries > 0 else 0,
        'all_deliveries_count': all_deliveries.count(),
        'in_progress': all_deliveries.filter(status__in=['assigned', 'picked_up', 'delivering']).count()
    })
