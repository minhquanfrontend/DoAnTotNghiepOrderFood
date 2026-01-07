"""
Seller Admin Site - Phân quyền riêng cho Seller
Seller chỉ có thể quản lý nhà hàng, món ăn, đơn hàng của riêng họ
"""
from django.contrib import admin
from django.contrib.admin import AdminSite
from django.utils.html import format_html
from django.urls import reverse
from django.db.models import Sum, Count
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
import json

from .models import Restaurant, Food, Category
from orders.models import Order, OrderItem
from payments.models import Payment


class SellerAdminSite(AdminSite):
    """Custom Admin Site for Sellers"""
    site_header = 'Seller Dashboard'
    site_title = 'Quản lý nhà hàng'
    index_title = 'Dashboard - Quản lý nhà hàng của bạn'
    index_template = 'seller_admin/index.html'
    
    def has_permission(self, request):
        """Check if user is seller or staff"""
        return request.user.is_active and (
            request.user.is_staff or 
            getattr(request.user, 'user_type', None) in ['seller', 'restaurant']
        )
    
    def index(self, request, extra_context=None):
        """Custom index with seller statistics"""
        extra_context = extra_context or {}
        
        # Get seller's restaurant
        restaurant = Restaurant.objects.filter(owner=request.user).first()
        
        if restaurant:
            now = timezone.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            week_start = today_start - timedelta(days=7)
            month_start = today_start - timedelta(days=30)
            
            # Orders for this restaurant
            orders = Order.objects.filter(restaurant=restaurant)
            
            # Revenue stats
            total_revenue = orders.filter(
                status__in=['completed', 'delivered']
            ).aggregate(total=Coalesce(Sum('total_amount'), Decimal('0')))['total']
            
            today_revenue = orders.filter(
                created_at__gte=today_start,
                status__in=['completed', 'delivered']
            ).aggregate(total=Coalesce(Sum('total_amount'), Decimal('0')))['total']
            
            month_revenue = orders.filter(
                created_at__gte=month_start,
                status__in=['completed', 'delivered']
            ).aggregate(total=Coalesce(Sum('total_amount'), Decimal('0')))['total']
            
            # Order stats
            total_orders = orders.count()
            today_orders = orders.filter(created_at__gte=today_start).count()
            pending_orders = orders.filter(status='pending').count()
            completed_orders = orders.filter(status__in=['completed', 'delivered']).count()
            
            # Food stats
            total_foods = Food.objects.filter(restaurant=restaurant).count()
            available_foods = Food.objects.filter(restaurant=restaurant, is_available=True).count()
            
            # Chart data - 30 days revenue (use DATE() for MySQL compatibility)
            revenue_30days = orders.filter(
                created_at__gte=month_start
            ).extra(
                select={'day': 'DATE(created_at)'}
            ).values('day').annotate(
                revenue=Sum('total_amount'),
                order_count=Count('id')
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
                    chart_orders.append(item['order_count'])
            
            # Status distribution
            status_distribution = list(orders.values('status').annotate(
                count=Count('id')
            ).order_by('-count')[:6])
            
            # Top selling foods
            top_foods = OrderItem.objects.filter(
                order__restaurant=restaurant,
                order__status__in=['completed', 'delivered'],
                order__created_at__gte=month_start
            ).values(
                'food__id', 'food__name'
            ).annotate(
                total_sold=Sum('quantity'),
                revenue=Sum('price')
            ).order_by('-total_sold')[:5]
            
            extra_context.update({
                'restaurant': restaurant,
                'total_revenue': float(total_revenue),
                'today_revenue': float(today_revenue),
                'month_revenue': float(month_revenue),
                'total_orders': total_orders,
                'today_orders': today_orders,
                'pending_orders': pending_orders,
                'completed_orders': completed_orders,
                'total_foods': total_foods,
                'available_foods': available_foods,
                'chart_labels': json.dumps(chart_labels),
                'chart_revenue': json.dumps(chart_revenue),
                'chart_orders': json.dumps(chart_orders),
                'status_distribution': json.dumps(status_distribution),
                'top_foods': list(top_foods),
            })
        else:
            extra_context['no_restaurant'] = True
        
        return super().index(request, extra_context=extra_context)


# Create seller admin site instance
seller_admin_site = SellerAdminSite(name='seller_admin')


class SellerRestaurantAdmin(admin.ModelAdmin):
    """Restaurant admin for sellers - can only see their own restaurant"""
    list_display = ('name', 'is_active', 'is_open', 'rating', 'total_reviews', 'phone')
    list_filter = ('is_active', 'is_open')
    search_fields = ('name', 'address')
    readonly_fields = ('rating', 'total_reviews', 'created_at', 'updated_at', 'owner')
    
    fieldsets = (
        ('Thông tin cơ bản', {
            'fields': ('name', 'description', 'image', 'owner')
        }),
        ('Địa chỉ & Liên hệ', {
            'fields': ('address', 'phone', 'latitude', 'longitude')
        }),
        ('Trạng thái', {
            'fields': ('is_active', 'is_open')
        }),
        ('Thống kê', {
            'fields': ('rating', 'total_reviews', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        """Only show seller's own restaurant"""
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(owner=request.user)
    
    def has_add_permission(self, request):
        """Seller can only have one restaurant"""
        if request.user.is_superuser:
            return True
        return not Restaurant.objects.filter(owner=request.user).exists()
    
    def has_delete_permission(self, request, obj=None):
        """Sellers cannot delete their restaurant"""
        return request.user.is_superuser
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.owner = request.user
        super().save_model(request, obj, form, change)


class SellerFoodAdmin(admin.ModelAdmin):
    """Food admin for sellers - can only manage their restaurant's foods"""
    list_display = ('name', 'category', 'price', 'is_available', 'is_featured', 'total_orders')
    list_filter = ('is_available', 'is_featured', 'category')
    search_fields = ('name', 'description')
    readonly_fields = ('total_orders', 'rating', 'total_reviews', 'restaurant')
    list_editable = ('is_available', 'is_featured', 'price')
    
    fieldsets = (
        ('Thông tin món ăn', {
            'fields': ('restaurant', 'name', 'description', 'image', 'category')
        }),
        ('Giá & Trạng thái', {
            'fields': ('price', 'is_available', 'is_featured')
        }),
        ('Thống kê', {
            'fields': ('total_orders', 'rating', 'total_reviews'),
            'classes': ('collapse',)
        }),
    )
    
    def has_add_permission(self, request):
        """Seller can add food if they have a restaurant"""
        if request.user.is_superuser:
            return True
        return Restaurant.objects.filter(owner=request.user).exists()
    
    def get_queryset(self, request):
        """Only show foods from seller's restaurant"""
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        restaurant = Restaurant.objects.filter(owner=request.user).first()
        if restaurant:
            return qs.filter(restaurant=restaurant)
        return qs.none()
    
    def save_model(self, request, obj, form, change):
        if not change:
            restaurant = Restaurant.objects.filter(owner=request.user).first()
            if restaurant:
                obj.restaurant = restaurant
        super().save_model(request, obj, form, change)
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "restaurant" and not request.user.is_superuser:
            kwargs["queryset"] = Restaurant.objects.filter(owner=request.user)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('food', 'quantity', 'price', 'notes')
    can_delete = False
    
    def has_add_permission(self, request, obj=None):
        return False


class SellerOrderAdmin(admin.ModelAdmin):
    """Order admin for sellers - can only see their restaurant's orders"""
    list_display = ('order_number', 'customer_name', 'status', 'total_amount', 'payment_status', 'created_at', 'order_actions')
    list_filter = ('status', 'payment_status', 'created_at')
    search_fields = ('order_number', 'customer__username', 'delivery_phone')
    readonly_fields = (
        'order_number', 'customer', 'restaurant', 'shipper',
        'subtotal', 'delivery_fee', 'total_amount',
        'delivery_address', 'delivery_phone', 'notes',
        'payment_status', 'created_at', 'updated_at'
    )
    inlines = [OrderItemInline]
    list_per_page = 20
    ordering = ['-created_at']
    
    fieldsets = (
        ('Thông tin đơn hàng', {
            'fields': ('order_number', 'status', 'customer', 'restaurant')
        }),
        ('Chi tiết giao hàng', {
            'fields': ('delivery_address', 'delivery_phone', 'notes', 'shipper')
        }),
        ('Thanh toán', {
            'fields': ('subtotal', 'delivery_fee', 'total_amount', 'payment_status')
        }),
        ('Thời gian', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def customer_name(self, obj):
        if obj.customer:
            return f"{obj.customer.first_name} {obj.customer.last_name}".strip() or obj.customer.username
        return "N/A"
    customer_name.short_description = 'Khách hàng'
    
    def order_actions(self, obj):
        """Quick action buttons for order status"""
        actions = []
        
        if obj.status == 'pending':
            actions.append(f'<a href="?action=confirm&order_id={obj.id}" class="button" style="background:#28a745;color:#fff;padding:3px 8px;border-radius:3px;margin-right:5px;">Xác nhận</a>')
        elif obj.status == 'confirmed':
            actions.append(f'<a href="?action=prepare&order_id={obj.id}" class="button" style="background:#17a2b8;color:#fff;padding:3px 8px;border-radius:3px;margin-right:5px;">Chuẩn bị</a>')
        elif obj.status == 'preparing':
            actions.append(f'<a href="?action=ready&order_id={obj.id}" class="button" style="background:#6f42c1;color:#fff;padding:3px 8px;border-radius:3px;margin-right:5px;">Sẵn sàng</a>')
        
        return format_html(''.join(actions)) if actions else '-'
    order_actions.short_description = 'Thao tác'
    
    def get_queryset(self, request):
        """Only show orders from seller's restaurant"""
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        restaurant = Restaurant.objects.filter(owner=request.user).first()
        if restaurant:
            return qs.filter(restaurant=restaurant)
        return qs.none()
    
    def has_add_permission(self, request):
        """Sellers cannot create orders"""
        return False
    
    def has_delete_permission(self, request, obj=None):
        """Sellers cannot delete orders"""
        return False
    
    def changelist_view(self, request, extra_context=None):
        """Handle quick actions"""
        action = request.GET.get('action')
        order_id = request.GET.get('order_id')
        
        if action and order_id:
            try:
                order = Order.objects.get(id=order_id)
                restaurant = Restaurant.objects.filter(owner=request.user).first()
                
                if order.restaurant == restaurant or request.user.is_superuser:
                    if action == 'confirm' and order.status == 'pending':
                        order.status = 'confirmed'
                        order.save()
                        self.message_user(request, f'Đã xác nhận đơn hàng #{order.order_number}')
                    elif action == 'prepare' and order.status == 'confirmed':
                        order.status = 'preparing'
                        order.save()
                        self.message_user(request, f'Đơn hàng #{order.order_number} đang được chuẩn bị')
                    elif action == 'ready' and order.status == 'preparing':
                        order.status = 'ready'
                        order.save()
                        self.message_user(request, f'Đơn hàng #{order.order_number} đã sẵn sàng giao')
            except Order.DoesNotExist:
                pass
            
            from django.http import HttpResponseRedirect
            return HttpResponseRedirect(request.path)
        
        return super().changelist_view(request, extra_context)


class SellerPaymentAdmin(admin.ModelAdmin):
    """Payment admin for sellers - read only view of their payments"""
    list_display = ('order_link', 'amount', 'payment_method', 'status', 'created_at')
    list_filter = ('status', 'payment_method', 'created_at')
    readonly_fields = ('order', 'amount', 'payment_method', 'status', 'transaction_id', 'created_at')
    
    def order_link(self, obj):
        if obj.order:
            return f"#{obj.order.order_number}"
        return "-"
    order_link.short_description = 'Đơn hàng'
    
    def get_queryset(self, request):
        """Only show payments for seller's restaurant orders"""
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        restaurant = Restaurant.objects.filter(owner=request.user).first()
        if restaurant:
            return qs.filter(order__restaurant=restaurant)
        return qs.none()
    
    def has_add_permission(self, request):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


# Register models to seller admin site
seller_admin_site.register(Restaurant, SellerRestaurantAdmin)
seller_admin_site.register(Food, SellerFoodAdmin)
seller_admin_site.register(Order, SellerOrderAdmin)
seller_admin_site.register(Payment, SellerPaymentAdmin)
seller_admin_site.register(Category)  # Read-only for reference
