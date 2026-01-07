from django.contrib import admin
from .models import ShipperLocation, DeliveryTracking, RoutePoint

@admin.register(ShipperLocation)
class ShipperLocationAdmin(admin.ModelAdmin):
    list_display = ['shipper', 'latitude', 'longitude', 'timestamp', 'is_active']
    list_filter = ['is_active', 'timestamp']
    search_fields = ['shipper__username', 'shipper__first_name', 'shipper__last_name']
    readonly_fields = ['timestamp']

class RoutePointInline(admin.TabularInline):
    model = RoutePoint
    extra = 0
    readonly_fields = ['timestamp']

@admin.register(DeliveryTracking)
class DeliveryTrackingAdmin(admin.ModelAdmin):
    list_display = ['order', 'shipper', 'status', 'created_at', 'updated_at']
    list_filter = ['status', 'created_at']
    search_fields = ['order__id', 'shipper__username']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [RoutePointInline]

@admin.register(RoutePoint)
class RoutePointAdmin(admin.ModelAdmin):
    list_display = ['delivery_tracking', 'latitude', 'longitude', 'timestamp', 'speed']
    list_filter = ['timestamp']
    readonly_fields = ['timestamp']
