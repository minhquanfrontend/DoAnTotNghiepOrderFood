from django.db import models
from django.contrib.auth.models import User
from orders.models import Order

class ShipperLocation(models.Model):
    shipper = models.ForeignKey(User, on_delete=models.CASCADE, related_name='locations')
    latitude = models.DecimalField(max_digits=10, decimal_places=8)
    longitude = models.DecimalField(max_digits=11, decimal_places=8)
    timestamp = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    speed = models.FloatField(null=True, blank=True)  # km/h
    heading = models.FloatField(null=True, blank=True)  # degrees
    accuracy = models.FloatField(null=True, blank=True)  # meters
    
    class Meta:
        ordering = ['-timestamp']
        
    def __str__(self):
        return f"{self.shipper.username} - {self.timestamp}"

class DeliveryTracking(models.Model):
    TRACKING_STATUS = [
        ('picked_up', 'Đã lấy hàng'),
        ('in_transit', 'Đang giao'),
        ('near_destination', 'Gần đến nơi'),
        ('delivered', 'Đã giao'),
        ('failed', 'Giao thất bại'),
    ]
    
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='delivery_tracking')
    shipper = models.ForeignKey(User, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=TRACKING_STATUS, default='picked_up')
    pickup_location = models.JSONField()  # {lat, lng, address}
    delivery_location = models.JSONField()  # {lat, lng, address}
    current_location = models.JSONField(null=True, blank=True)  # {lat, lng}
    estimated_arrival = models.DateTimeField(null=True, blank=True)
    actual_pickup_time = models.DateTimeField(null=True, blank=True)
    actual_delivery_time = models.DateTimeField(null=True, blank=True)
    distance_traveled = models.FloatField(default=0.0)  # km
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Tracking #{self.order.id} - {self.status}"

class RoutePoint(models.Model):
    delivery_tracking = models.ForeignKey(DeliveryTracking, on_delete=models.CASCADE, related_name='route_points')
    latitude = models.DecimalField(max_digits=10, decimal_places=8)
    longitude = models.DecimalField(max_digits=11, decimal_places=8)
    timestamp = models.DateTimeField(auto_now_add=True)
    speed = models.FloatField(null=True, blank=True)
    
    class Meta:
        ordering = ['timestamp']
