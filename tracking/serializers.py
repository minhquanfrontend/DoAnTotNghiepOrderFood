from rest_framework import serializers
from .models import ShipperLocation, DeliveryTracking, RoutePoint
from accounts.serializers import UserSerializer

class ShipperLocationSerializer(serializers.ModelSerializer):
    shipper_name = serializers.CharField(source='shipper.get_full_name', read_only=True)
    
    class Meta:
        model = ShipperLocation
        fields = ['id', 'shipper', 'shipper_name', 'latitude', 'longitude', 
                 'timestamp', 'is_active', 'speed', 'heading', 'accuracy']
        read_only_fields = ['timestamp']

class RoutePointSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoutePoint
        fields = ['id', 'latitude', 'longitude', 'timestamp', 'speed']

class DeliveryTrackingSerializer(serializers.ModelSerializer):
    shipper_info = UserSerializer(source='shipper', read_only=True)
    route_points = RoutePointSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = DeliveryTracking
        fields = ['id', 'order', 'shipper', 'shipper_info', 'status', 'status_display',
                 'pickup_location', 'delivery_location', 'current_location',
                 'estimated_arrival', 'actual_pickup_time', 'actual_delivery_time',
                 'distance_traveled', 'notes', 'route_points', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

class DeliveryTrackingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryTracking
        fields = ['order', 'pickup_location', 'delivery_location', 'estimated_arrival']
