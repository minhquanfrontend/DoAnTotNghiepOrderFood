from django.contrib import admin
from .models import Order, OrderItem, OrderTracking, Cart, CartItem

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('total_price',)

class OrderTrackingInline(admin.TabularInline):
    model = OrderTracking
    extra = 0
    readonly_fields = ('created_at',)

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('order_number', 'customer', 'restaurant', 'status', 'total_amount', 'created_at')
    list_filter = ('status', 'payment_status', 'created_at')
    search_fields = ('order_number', 'customer__username', 'restaurant__name')
    inlines = [OrderItemInline, OrderTrackingInline]
    readonly_fields = ('order_number', 'created_at', 'updated_at')
    actions = ['mark_as_confirmed', 'mark_as_delivered', 'mark_as_cancelled']
    
    
    def mark_as_confirmed(self, request, queryset):
        updated = queryset.update(status='confirmed')
        self.message_user(request, f'Đã xác nhận {updated} đơn hàng.')
    mark_as_confirmed.short_description = 'Xác nhận đơn hàng đã chọn'
    
    def mark_as_delivered(self, request, queryset):
        updated = queryset.update(status='delivered')
        self.message_user(request, f'Đã đánh dấu {updated} đơn hàng là đã giao.')
    mark_as_delivered.short_description = 'Đánh dấu đã giao'
    
    def mark_as_cancelled(self, request, queryset):
        updated = queryset.update(status='cancelled')
        self.message_user(request, f'Đã hủy {updated} đơn hàng.')
    mark_as_cancelled.short_description = 'Hủy đơn hàng đã chọn'
    
    def response_add(self, request, obj, post_url_continue=None):
        if '_continue' not in request.POST and '_addanother' not in request.POST:
            return HttpResponseRedirect(reverse('admin:orders_order_changelist'))
        return super().response_add(request, obj, post_url_continue)
    
    def response_change(self, request, obj):
        if '_continue' not in request.POST:
            return HttpResponseRedirect(reverse('admin:orders_order_changelist'))
        return super().response_change(request, obj)

@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ('user', 'total_items', 'total_amount', 'updated_at')
    search_fields = ('user__username',)

class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
