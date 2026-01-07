from django.utils.translation import gettext_lazy as _
from django.db.models import Sum, Count, Avg, Q
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
import json


def dashboard_callback(request, context):
    """
    Callback to prepare custom variables for the admin dashboard template.
    Provides statistics and data for charts similar to ShopeeFood admin.
    """
    from orders.models import Order
    from restaurants.models import Restaurant, Food
    from accounts.models import User
    
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)
    
    # === TỔNG QUAN ===
    # Tổng doanh thu (GMV)
    total_gmv = Order.objects.filter(
        status__in=['completed', 'delivered']
    ).aggregate(total=Coalesce(Sum('total_amount'), Decimal('0')))['total']
    
    # Doanh thu hôm nay
    today_gmv = Order.objects.filter(
        created_at__gte=today_start,
        status__in=['completed', 'delivered']
    ).aggregate(total=Coalesce(Sum('total_amount'), Decimal('0')))['total']
    
    # Doanh thu tháng này
    month_gmv = Order.objects.filter(
        created_at__gte=month_start,
        status__in=['completed', 'delivered']
    ).aggregate(total=Coalesce(Sum('total_amount'), Decimal('0')))['total']
    
    # === ĐƠN HÀNG ===
    total_orders = Order.objects.count()
    today_orders = Order.objects.filter(created_at__gte=today_start).count()
    today_completed = Order.objects.filter(
        created_at__gte=today_start,
        status__in=['completed', 'delivered']
    ).count()
    pending_orders = Order.objects.filter(status='pending').count()
    
    # Phân bố trạng thái đơn hàng
    status_distribution = list(Order.objects.values('status').annotate(
        count=Count('id')
    ).order_by('-count')[:8])
    
    # === NGƯỜI DÙNG ===
    total_customers = User.objects.filter(user_type='customer').count()
    total_sellers = User.objects.filter(user_type__in=['seller', 'restaurant']).count()
    total_shippers = User.objects.filter(user_type='shipper').count()
    new_users_today = User.objects.filter(date_joined__gte=today_start).count()
    
    # === NHÀ HÀNG ===
    total_restaurants = Restaurant.objects.count()
    active_restaurants = Restaurant.objects.filter(is_active=True).count()
    total_foods = Food.objects.count()
    
    # === BIỂU ĐỒ DOANH THU 30 NGÀY === (use DATE() for MySQL compatibility)
    revenue_30days = Order.objects.filter(
        created_at__gte=month_start
    ).extra(
        select={'day': 'DATE(created_at)'}
    ).values('day').annotate(
        revenue=Sum('total_amount'),
        orders=Count('id')
    ).order_by('day')
    
    chart_labels = []
    chart_revenue = []
    chart_orders = []
    
    for item in revenue_30days:
        if item['day']:
            if hasattr(item['day'], 'strftime'):
                chart_labels.append(item['day'].strftime('%d/%m'))
            else:
                chart_labels.append(str(item['day']))
            chart_revenue.append(float(item['revenue'] or 0))
            chart_orders.append(item['orders'])
    
    # === TOP NHÀ HÀNG ===
    top_restaurants = Order.objects.filter(
        created_at__gte=month_start,
        status__in=['completed', 'delivered']
    ).values(
        'restaurant__id', 'restaurant__name'
    ).annotate(
        revenue=Sum('total_amount'),
        order_count=Count('id')
    ).order_by('-revenue')[:5]
    
    # Tổng số người dùng
    total_users = User.objects.count()
    
    context.update({
        # Tổng quan
        'total_gmv': float(total_gmv),
        'today_gmv': float(today_gmv),
        'month_gmv': float(month_gmv),
        
        # Đơn hàng
        'total_orders': total_orders,
        'today_orders': today_orders,
        'today_completed': today_completed,
        'pending_orders': pending_orders,
        
        # Người dùng
        'total_users': total_users,
        'total_customers': total_customers,
        'total_sellers': total_sellers,
        'total_shippers': total_shippers,
        'new_users_today': new_users_today,
        
        # Nhà hàng
        'total_restaurants': total_restaurants,
        'active_restaurants': active_restaurants,
        'total_foods': total_foods,
        
        # Biểu đồ - serialize to JSON string for JavaScript
        'chart_labels': json.dumps(chart_labels),
        'chart_revenue': json.dumps(chart_revenue),
        'chart_orders': json.dumps(chart_orders),
        'status_distribution': json.dumps(status_distribution),
        
        # Top nhà hàng
        'top_restaurants': list(top_restaurants),
    })
    
    return context
