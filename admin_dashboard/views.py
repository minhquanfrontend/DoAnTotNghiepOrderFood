"""
Admin Dashboard API Views
Comprehensive analytics and management for ShopeeFood-like admin panel
"""
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Sum, Count, Avg, F, Q, Case, When, Value, CharField
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth, Coalesce
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from orders.models import Order, OrderTracking
from restaurants.models import Restaurant, Food, Category
from accounts.models import User
from payments.models import Payment


class IsAdminUser(permissions.BasePermission):
    """Only allow admin/staff users"""
    def has_permission(self, request, view):
        return request.user and request.user.is_staff


# ==================== SYSTEM-WIDE ANALYTICS ====================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def system_overview(request):
    """
    Tổng quan hệ thống - Dashboard chính
    Hỗ trợ filter theo date range: ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    """
    from datetime import datetime
    
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Parse date range from query params
    start_date_str = request.query_params.get('start_date')
    end_date_str = request.query_params.get('end_date')
    
    if start_date_str and end_date_str:
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
            start_date = timezone.make_aware(start_date.replace(hour=0, minute=0, second=0))
            end_date = timezone.make_aware(end_date.replace(hour=23, minute=59, second=59))
        except ValueError:
            start_date = today_start - timedelta(days=7)
            end_date = now
    else:
        start_date = today_start - timedelta(days=7)
        end_date = now
    
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)
    
    # Filter orders by date range
    range_orders = Order.objects.filter(created_at__gte=start_date, created_at__lte=end_date)
    
    # Total GMV in date range
    range_gmv = range_orders.filter(
        status__in=['completed', 'delivered']
    ).aggregate(total=Coalesce(Sum('total_amount'), Decimal('0')))['total']
    
    # Total GMV all time
    total_gmv = Order.objects.filter(
        status__in=['completed', 'delivered']
    ).aggregate(total=Coalesce(Sum('total_amount'), Decimal('0')))['total']
    
    # Today's stats
    today_orders = Order.objects.filter(created_at__gte=today_start)
    today_gmv = today_orders.filter(
        status__in=['completed', 'delivered']
    ).aggregate(total=Coalesce(Sum('total_amount'), Decimal('0')))['total']
    today_order_count = today_orders.count()
    today_completed = today_orders.filter(status__in=['completed', 'delivered']).count()
    today_cancelled = today_orders.filter(status__startswith='cancelled').count()
    
    # Range order stats
    range_order_count = range_orders.count()
    range_completed = range_orders.filter(status__in=['completed', 'delivered']).count()
    range_pending = range_orders.filter(status='pending').count()
    
    # User counts
    total_customers = User.objects.filter(user_type='customer').count()
    total_sellers = User.objects.filter(user_type__in=['seller', 'restaurant']).count()
    total_shippers = User.objects.filter(user_type='shipper').count()
    total_restaurants = Restaurant.objects.count()
    active_restaurants = Restaurant.objects.filter(is_active=True).count()
    total_foods = Food.objects.count()
    
    # Order status distribution in date range
    status_distribution = range_orders.values('status').annotate(
        count=Count('id')
    ).order_by('-count')
    
    # Chart data - daily revenue and orders in date range (use DATE() for MySQL)
    chart_data = range_orders.filter(
        status__in=['completed', 'delivered']
    ).extra(
        select={'day': 'DATE(created_at)'}
    ).values('day').annotate(
        revenue=Sum('total_amount'),
        orders=Count('id')
    ).order_by('day')
    
    chart_labels = []
    chart_revenue = []
    chart_orders = []
    
    for item in chart_data:
        if item['day']:
            if hasattr(item['day'], 'strftime'):
                chart_labels.append(item['day'].strftime('%d/%m'))
            else:
                chart_labels.append(str(item['day']))
            chart_revenue.append(float(item['revenue'] or 0))
            chart_orders.append(item['orders'])
    
    # Top restaurants in date range
    top_restaurants = range_orders.filter(
        status__in=['completed', 'delivered']
    ).values(
        'restaurant__id', 'restaurant__name'
    ).annotate(
        revenue=Sum('total_amount'),
        order_count=Count('id')
    ).order_by('-revenue')[:5]
    
    return Response({
        'gmv': {
            'total': float(total_gmv),
            'range': float(range_gmv),
            'today': float(today_gmv),
        },
        'orders': {
            'total': range_order_count,
            'completed': range_completed,
            'pending': range_pending,
            'today': {
                'total': today_order_count,
                'completed': today_completed,
                'cancelled': today_cancelled,
                'success_rate': round(today_completed / max(today_order_count, 1) * 100, 1),
            },
            'status_distribution': list(status_distribution),
        },
        'users': {
            'customers': total_customers,
            'sellers': total_sellers,
            'shippers': total_shippers,
        },
        'restaurants': {
            'total': total_restaurants,
            'active': active_restaurants,
        },
        'foods': {
            'total': total_foods,
        },
        'chart_labels': chart_labels,
        'chart_revenue': chart_revenue,
        'chart_orders': chart_orders,
        'top_restaurants': list(top_restaurants),
        'date_range': {
            'start': start_date.strftime('%Y-%m-%d'),
            'end': end_date.strftime('%Y-%m-%d'),
        },
        'generated_at': now.isoformat(),
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def revenue_analytics(request):
    """
    Doanh thu chi tiết theo ngày/tuần/tháng/khu vực/loại quán
    """
    period = request.query_params.get('period', 'day')  # day, week, month
    days = int(request.query_params.get('days', 30))
    
    now = timezone.now()
    start_date = now - timedelta(days=days)
    
    # Base queryset - completed/delivered orders
    base_qs = Order.objects.filter(
        created_at__gte=start_date,
        status__in=['completed', 'delivered']
    )
    
    # Revenue by time period
    if period == 'day':
        trunc_func = TruncDay
    elif period == 'week':
        trunc_func = TruncWeek
    else:
        trunc_func = TruncMonth
    
    revenue_by_period = base_qs.annotate(
        period=trunc_func('created_at')
    ).values('period').annotate(
        revenue=Sum('total_amount'),
        order_count=Count('id'),
        avg_order_value=Avg('total_amount')
    ).order_by('period')
    
    # Revenue by restaurant category
    revenue_by_category = base_qs.values(
        category_name=F('restaurant__category__name')
    ).annotate(
        revenue=Sum('total_amount'),
        order_count=Count('id')
    ).order_by('-revenue')[:10]
    
    # Revenue by region (based on delivery address - simplified)
    # In real app, you'd have proper region/district fields
    revenue_by_region = base_qs.exclude(
        delivery_address__isnull=True
    ).exclude(
        delivery_address=''
    ).annotate(
        # Extract district from address (simplified)
        region=Case(
            When(delivery_address__icontains='Quận 1', then=Value('Quận 1')),
            When(delivery_address__icontains='Quận 2', then=Value('Quận 2')),
            When(delivery_address__icontains='Quận 3', then=Value('Quận 3')),
            When(delivery_address__icontains='Quận 4', then=Value('Quận 4')),
            When(delivery_address__icontains='Quận 5', then=Value('Quận 5')),
            When(delivery_address__icontains='Quận 6', then=Value('Quận 6')),
            When(delivery_address__icontains='Quận 7', then=Value('Quận 7')),
            When(delivery_address__icontains='Quận 8', then=Value('Quận 8')),
            When(delivery_address__icontains='Quận 9', then=Value('Quận 9')),
            When(delivery_address__icontains='Quận 10', then=Value('Quận 10')),
            When(delivery_address__icontains='Quận 11', then=Value('Quận 11')),
            When(delivery_address__icontains='Quận 12', then=Value('Quận 12')),
            When(delivery_address__icontains='Bình Thạnh', then=Value('Bình Thạnh')),
            When(delivery_address__icontains='Thủ Đức', then=Value('Thủ Đức')),
            When(delivery_address__icontains='Gò Vấp', then=Value('Gò Vấp')),
            When(delivery_address__icontains='Tân Bình', then=Value('Tân Bình')),
            When(delivery_address__icontains='Tân Phú', then=Value('Tân Phú')),
            When(delivery_address__icontains='Phú Nhuận', then=Value('Phú Nhuận')),
            default=Value('Khác'),
            output_field=CharField()
        )
    ).values('region').annotate(
        revenue=Sum('total_amount'),
        order_count=Count('id')
    ).order_by('-revenue')
    
    return Response({
        'period': period,
        'days': days,
        'revenue_by_period': [
            {
                'period': item['period'].isoformat() if item['period'] else None,
                'revenue': float(item['revenue'] or 0),
                'order_count': item['order_count'],
                'avg_order_value': float(item['avg_order_value'] or 0),
            }
            for item in revenue_by_period
        ],
        'revenue_by_category': [
            {
                'category': item['category_name'] or 'Chưa phân loại',
                'revenue': float(item['revenue'] or 0),
                'order_count': item['order_count'],
            }
            for item in revenue_by_category
        ],
        'revenue_by_region': [
            {
                'region': item['region'],
                'revenue': float(item['revenue'] or 0),
                'order_count': item['order_count'],
            }
            for item in revenue_by_region
        ],
    })


# ==================== SELLER PERFORMANCE ====================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def seller_performance(request):
    """
    Phân tích hiệu suất seller - quán bán tốt, tụt doanh thu, nghi gian lận
    """
    days = int(request.query_params.get('days', 30))
    now = timezone.now()
    start_date = now - timedelta(days=days)
    prev_start = start_date - timedelta(days=days)
    
    # Current period stats per restaurant
    current_stats = Order.objects.filter(
        created_at__gte=start_date,
        status__in=['completed', 'delivered']
    ).values(
        restaurant_id=F('restaurant__id'),
        restaurant_name=F('restaurant__name'),
        owner_id=F('restaurant__owner__id'),
        owner_name=F('restaurant__owner__username'),
    ).annotate(
        revenue=Sum('total_amount'),
        order_count=Count('id'),
        avg_order_value=Avg('total_amount'),
    ).order_by('-revenue')
    
    # Previous period for comparison
    prev_stats = Order.objects.filter(
        created_at__gte=prev_start,
        created_at__lt=start_date,
        status__in=['completed', 'delivered']
    ).values(
        restaurant_id=F('restaurant__id'),
    ).annotate(
        prev_revenue=Sum('total_amount'),
        prev_order_count=Count('id'),
    )
    prev_dict = {s['restaurant_id']: s for s in prev_stats}
    
    # Cancellation stats per restaurant
    cancel_stats = Order.objects.filter(
        created_at__gte=start_date,
        status__startswith='cancelled'
    ).values(
        restaurant_id=F('restaurant__id'),
    ).annotate(
        cancelled_count=Count('id'),
    )
    cancel_dict = {s['restaurant_id']: s['cancelled_count'] for s in cancel_stats}
    
    # Total orders per restaurant (for cancel rate)
    total_orders = Order.objects.filter(
        created_at__gte=start_date,
    ).values(
        restaurant_id=F('restaurant__id'),
    ).annotate(
        total_count=Count('id'),
    )
    total_dict = {s['restaurant_id']: s['total_count'] for s in total_orders}
    
    # Build seller list with analysis
    sellers = []
    top_sellers = []
    declining_sellers = []
    suspicious_sellers = []
    
    for stat in current_stats:
        rid = stat['restaurant_id']
        prev = prev_dict.get(rid, {})
        prev_revenue = float(prev.get('prev_revenue', 0) or 0)
        current_revenue = float(stat['revenue'] or 0)
        
        # Calculate growth
        if prev_revenue > 0:
            growth = ((current_revenue - prev_revenue) / prev_revenue) * 100
        else:
            growth = 100 if current_revenue > 0 else 0
        
        # Calculate cancel rate
        cancelled = cancel_dict.get(rid, 0)
        total = total_dict.get(rid, 1)
        cancel_rate = (cancelled / max(total, 1)) * 100
        
        seller_data = {
            'restaurant_id': rid,
            'restaurant_name': stat['restaurant_name'],
            'owner_id': stat['owner_id'],
            'owner_name': stat['owner_name'],
            'revenue': current_revenue,
            'prev_revenue': prev_revenue,
            'growth_percent': round(growth, 1),
            'order_count': stat['order_count'],
            'avg_order_value': float(stat['avg_order_value'] or 0),
            'cancelled_orders': cancelled,
            'cancel_rate': round(cancel_rate, 1),
        }
        sellers.append(seller_data)
        
        # Categorize
        if current_revenue > 0:
            top_sellers.append(seller_data)
        
        if growth < -20:  # Declining more than 20%
            declining_sellers.append(seller_data)
        
        # Suspicious: high cancel rate or unusual patterns
        if cancel_rate > 30 or (stat['order_count'] > 10 and cancel_rate > 20):
            suspicious_sellers.append({
                **seller_data,
                'reason': 'Tỷ lệ hủy đơn cao' if cancel_rate > 30 else 'Nhiều đơn hủy bất thường'
            })
    
    # Sort
    top_sellers = sorted(top_sellers, key=lambda x: x['revenue'], reverse=True)[:10]
    declining_sellers = sorted(declining_sellers, key=lambda x: x['growth_percent'])[:10]
    
    return Response({
        'period_days': days,
        'total_sellers': len(sellers),
        'top_sellers': top_sellers,
        'declining_sellers': declining_sellers,
        'suspicious_sellers': suspicious_sellers,
        'all_sellers': sellers[:50],  # Limit to 50
    })


# ==================== OPERATIONAL MONITORING ====================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def operational_issues(request):
    """
    Giám sát vận hành - đơn stuck, shipper không giao, seller xác nhận chậm
    """
    now = timezone.now()
    
    # Stuck orders - orders in non-final status for too long
    stuck_threshold = {
        'pending': timedelta(minutes=30),      # Chờ xác nhận > 30 phút
        'confirmed': timedelta(hours=1),       # Đã xác nhận > 1 giờ
        'preparing': timedelta(hours=2),       # Đang chuẩn bị > 2 giờ
        'ready': timedelta(hours=1),           # Sẵn sàng > 1 giờ (chưa có shipper)
        'assigned': timedelta(minutes=45),     # Shipper nhận > 45 phút
        'picked_up': timedelta(minutes=30),    # Đã lấy hàng > 30 phút
        'delivering': timedelta(hours=1),      # Đang giao > 1 giờ
    }
    
    stuck_orders = []
    for status_code, threshold in stuck_threshold.items():
        cutoff = now - threshold
        orders = Order.objects.filter(
            status=status_code,
            updated_at__lt=cutoff
        ).select_related('restaurant', 'customer', 'shipper')[:20]
        
        for order in orders:
            stuck_time = now - order.updated_at
            stuck_orders.append({
                'order_id': order.id,
                'order_number': order.order_number,
                'status': order.status,
                'status_display': order.get_status_display(),
                'restaurant_name': order.restaurant.name if order.restaurant else None,
                'customer_name': f"{order.customer.first_name} {order.customer.last_name}".strip() if order.customer else None,
                'shipper_name': f"{order.shipper.first_name} {order.shipper.last_name}".strip() if order.shipper else None,
                'stuck_minutes': int(stuck_time.total_seconds() / 60),
                'created_at': order.created_at.isoformat(),
                'updated_at': order.updated_at.isoformat(),
                'issue_type': f'Đơn {order.get_status_display()} quá lâu',
            })
    
    # Sort by stuck time
    stuck_orders = sorted(stuck_orders, key=lambda x: x['stuck_minutes'], reverse=True)
    
    # Slow confirmation sellers (average confirmation time > 15 minutes)
    slow_sellers = []
    restaurants = Restaurant.objects.filter(is_active=True)
    for restaurant in restaurants[:50]:
        # Get orders confirmed in last 7 days
        confirmed_orders = Order.objects.filter(
            restaurant=restaurant,
            status__in=['confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering', 'delivered', 'completed'],
            created_at__gte=now - timedelta(days=7)
        )
        
        if confirmed_orders.count() < 3:
            continue
        
        # Calculate average confirmation time from tracking
        total_time = timedelta()
        count = 0
        for order in confirmed_orders[:20]:
            try:
                created = order.created_at
                confirmed_track = order.tracking.filter(status='confirmed').first()
                if confirmed_track:
                    conf_time = confirmed_track.created_at - created
                    total_time += conf_time
                    count += 1
            except:
                pass
        
        if count > 0:
            avg_minutes = (total_time.total_seconds() / count) / 60
            if avg_minutes > 15:  # More than 15 minutes average
                slow_sellers.append({
                    'restaurant_id': restaurant.id,
                    'restaurant_name': restaurant.name,
                    'owner_name': restaurant.owner.username if restaurant.owner else None,
                    'avg_confirmation_minutes': round(avg_minutes, 1),
                    'sample_size': count,
                })
    
    slow_sellers = sorted(slow_sellers, key=lambda x: x['avg_confirmation_minutes'], reverse=True)[:10]
    
    # High cancellation rate sellers (last 7 days)
    high_cancel_sellers = []
    cancel_stats = Order.objects.filter(
        created_at__gte=now - timedelta(days=7)
    ).values(
        restaurant_id=F('restaurant__id'),
        restaurant_name=F('restaurant__name'),
    ).annotate(
        total=Count('id'),
        cancelled=Count('id', filter=Q(status__startswith='cancelled')),
    ).filter(total__gte=5)  # At least 5 orders
    
    for stat in cancel_stats:
        cancel_rate = (stat['cancelled'] / stat['total']) * 100
        if cancel_rate > 20:  # More than 20% cancellation
            high_cancel_sellers.append({
                'restaurant_id': stat['restaurant_id'],
                'restaurant_name': stat['restaurant_name'],
                'total_orders': stat['total'],
                'cancelled_orders': stat['cancelled'],
                'cancel_rate': round(cancel_rate, 1),
            })
    
    high_cancel_sellers = sorted(high_cancel_sellers, key=lambda x: x['cancel_rate'], reverse=True)[:10]
    
    # Shipper issues - shippers with delivery problems
    shipper_issues = []
    shipper_stats = Order.objects.filter(
        shipper__isnull=False,
        created_at__gte=now - timedelta(days=7)
    ).values(
        shipper_id=F('shipper__id'),
        shipper_name=F('shipper__username'),
    ).annotate(
        total=Count('id'),
        delivered=Count('id', filter=Q(status__in=['delivered', 'completed'])),
        failed=Count('id', filter=Q(status='failed_delivery')),
        cancelled=Count('id', filter=Q(status='cancelled_by_shipper')),
    ).filter(total__gte=3)
    
    for stat in shipper_stats:
        success_rate = (stat['delivered'] / stat['total']) * 100
        if success_rate < 80 or stat['failed'] > 0 or stat['cancelled'] > 1:
            shipper_issues.append({
                'shipper_id': stat['shipper_id'],
                'shipper_name': stat['shipper_name'],
                'total_orders': stat['total'],
                'delivered': stat['delivered'],
                'failed': stat['failed'],
                'cancelled': stat['cancelled'],
                'success_rate': round(success_rate, 1),
            })
    
    shipper_issues = sorted(shipper_issues, key=lambda x: x['success_rate'])[:10]
    
    return Response({
        'stuck_orders': stuck_orders[:30],
        'stuck_count': len(stuck_orders),
        'slow_confirmation_sellers': slow_sellers,
        'high_cancellation_sellers': high_cancel_sellers,
        'shipper_issues': shipper_issues,
        'generated_at': now.isoformat(),
    })


# ==================== ADMIN ACTIONS ====================

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def block_restaurant(request, restaurant_id):
    """Khóa quán ăn"""
    try:
        restaurant = Restaurant.objects.get(id=restaurant_id)
        reason = request.data.get('reason', 'Vi phạm chính sách')
        
        restaurant.is_active = False
        restaurant.save()
        
        # Also deactivate owner account if needed
        if request.data.get('block_owner', False) and restaurant.owner:
            restaurant.owner.is_active = False
            restaurant.owner.save()
        
        return Response({
            'success': True,
            'message': f'Đã khóa quán {restaurant.name}',
            'reason': reason,
        })
    except Restaurant.DoesNotExist:
        return Response({'error': 'Không tìm thấy quán'}, status=404)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def unblock_restaurant(request, restaurant_id):
    """Mở khóa quán ăn"""
    try:
        restaurant = Restaurant.objects.get(id=restaurant_id)
        restaurant.is_active = True
        restaurant.save()
        
        # Also reactivate owner if needed
        if request.data.get('unblock_owner', False) and restaurant.owner:
            restaurant.owner.is_active = True
            restaurant.owner.save()
        
        return Response({
            'success': True,
            'message': f'Đã mở khóa quán {restaurant.name}',
        })
    except Restaurant.DoesNotExist:
        return Response({'error': 'Không tìm thấy quán'}, status=404)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def block_shipper(request, shipper_id):
    """Khóa tài khoản shipper"""
    try:
        shipper = User.objects.get(id=shipper_id, user_type='shipper')
        reason = request.data.get('reason', 'Vi phạm chính sách')
        
        shipper.is_active = False
        shipper.save()
        
        return Response({
            'success': True,
            'message': f'Đã khóa shipper {shipper.username}',
            'reason': reason,
        })
    except User.DoesNotExist:
        return Response({'error': 'Không tìm thấy shipper'}, status=404)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def unblock_shipper(request, shipper_id):
    """Mở khóa tài khoản shipper"""
    try:
        shipper = User.objects.get(id=shipper_id, user_type='shipper')
        shipper.is_active = True
        shipper.save()
        
        return Response({
            'success': True,
            'message': f'Đã mở khóa shipper {shipper.username}',
        })
    except User.DoesNotExist:
        return Response({'error': 'Không tìm thấy shipper'}, status=404)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def intervene_order(request, order_id):
    """Can thiệp đơn hàng - admin force update status"""
    try:
        order = Order.objects.get(id=order_id)
        action = request.data.get('action')  # cancel, reassign_shipper, force_complete
        reason = request.data.get('reason', 'Admin can thiệp')
        
        if action == 'cancel':
            order.status = 'cancelled_by_admin'
            order.save()
            OrderTracking.objects.create(
                order=order,
                status='cancelled_by_admin',
                message=f'Admin hủy đơn: {reason}'
            )
            return Response({'success': True, 'message': 'Đã hủy đơn hàng'})
        
        elif action == 'reassign_shipper':
            # Remove current shipper, set back to ready
            order.shipper = None
            order.status = 'ready'
            order.save()
            OrderTracking.objects.create(
                order=order,
                status='ready',
                message=f'Admin gỡ shipper, đơn chờ shipper mới: {reason}'
            )
            return Response({'success': True, 'message': 'Đã gỡ shipper, đơn chờ shipper mới'})
        
        elif action == 'force_complete':
            order.status = 'completed'
            order.save()
            OrderTracking.objects.create(
                order=order,
                status='completed',
                message=f'Admin hoàn thành đơn: {reason}'
            )
            return Response({'success': True, 'message': 'Đã hoàn thành đơn hàng'})
        
        else:
            return Response({'error': 'Action không hợp lệ'}, status=400)
        
    except Order.DoesNotExist:
        return Response({'error': 'Không tìm thấy đơn hàng'}, status=404)


# ==================== USER MANAGEMENT ====================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def list_users(request):
    """Danh sách users theo loại"""
    user_type = request.query_params.get('type', 'all')
    page = int(request.query_params.get('page', 1))
    limit = int(request.query_params.get('limit', 20))
    
    qs = User.objects.all()
    if user_type != 'all':
        qs = qs.filter(user_type=user_type)
    
    total = qs.count()
    users = qs.order_by('-date_joined')[(page-1)*limit:page*limit]
    
    return Response({
        'total': total,
        'page': page,
        'limit': limit,
        'users': [
            {
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'user_type': u.user_type,
                'is_active': u.is_active,
                'is_staff': u.is_staff,
                'date_joined': u.date_joined.isoformat(),
                'last_login': u.last_login.isoformat() if u.last_login else None,
            }
            for u in users
        ],
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def update_user_role(request, user_id):
    """Cập nhật role/quyền user"""
    try:
        user = User.objects.get(id=user_id)
        
        new_type = request.data.get('user_type')
        is_staff = request.data.get('is_staff')
        is_active = request.data.get('is_active')
        
        if new_type:
            user.user_type = new_type
        if is_staff is not None:
            user.is_staff = is_staff
        if is_active is not None:
            user.is_active = is_active
        
        user.save()
        
        return Response({
            'success': True,
            'message': f'Đã cập nhật user {user.username}',
            'user': {
                'id': user.id,
                'username': user.username,
                'user_type': user.user_type,
                'is_staff': user.is_staff,
                'is_active': user.is_active,
            }
        })
    except User.DoesNotExist:
        return Response({'error': 'Không tìm thấy user'}, status=404)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def list_restaurants(request):
    """Danh sách quán ăn với thống kê"""
    page = int(request.query_params.get('page', 1))
    limit = int(request.query_params.get('limit', 20))
    status_filter = request.query_params.get('status', 'all')  # all, active, inactive
    
    qs = Restaurant.objects.all()
    if status_filter == 'active':
        qs = qs.filter(is_active=True)
    elif status_filter == 'inactive':
        qs = qs.filter(is_active=False)
    
    total = qs.count()
    restaurants = qs.select_related('owner', 'category').order_by('-created_at')[(page-1)*limit:page*limit]
    
    now = timezone.now()
    week_ago = now - timedelta(days=7)
    
    result = []
    for r in restaurants:
        # Get order stats
        orders = Order.objects.filter(restaurant=r, created_at__gte=week_ago)
        completed = orders.filter(status__in=['completed', 'delivered']).count()
        cancelled = orders.filter(status__startswith='cancelled').count()
        revenue = orders.filter(status__in=['completed', 'delivered']).aggregate(
            total=Coalesce(Sum('total_amount'), Decimal('0'))
        )['total']
        
        result.append({
            'id': r.id,
            'name': r.name,
            'owner_id': r.owner.id if r.owner else None,
            'owner_name': r.owner.username if r.owner else None,
            'category': r.category.name if r.category else None,
            'address': r.address,
            'phone': r.phone,
            'is_active': r.is_active,
            'created_at': r.created_at.isoformat() if hasattr(r, 'created_at') and r.created_at else None,
            'stats_7d': {
                'orders': orders.count(),
                'completed': completed,
                'cancelled': cancelled,
                'revenue': float(revenue),
            }
        })
    
    return Response({
        'total': total,
        'page': page,
        'limit': limit,
        'restaurants': result,
    })
