from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Q
from .models import ShipperLocation, DeliveryTracking, RoutePoint
from .serializers import (
    ShipperLocationSerializer, 
    DeliveryTrackingSerializer,
    DeliveryTrackingCreateSerializer,
    RoutePointSerializer
)
from orders.models import Order
import math

class ShipperLocationListCreateView(generics.ListCreateAPIView):
    serializer_class = ShipperLocationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        if self.request.user.userprofile.user_type == 'shipper':
            return ShipperLocation.objects.filter(shipper=self.request.user)
        return ShipperLocation.objects.all()
    
    def perform_create(self, serializer):
        serializer.save(shipper=self.request.user)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_shipper_location(request):
    """Update shipper's current location"""
    if request.user.userprofile.user_type != 'shipper':
        return Response({'error': 'Chỉ shipper mới có thể cập nhật vị trí'}, 
                       status=status.HTTP_403_FORBIDDEN)
    
    data = request.data
    location = ShipperLocation.objects.create(
        shipper=request.user,
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        speed=data.get('speed'),
        heading=data.get('heading'),
        accuracy=data.get('accuracy')
    )
    
    active_deliveries = DeliveryTracking.objects.filter(
        shipper=request.user,
        status__in=['picked_up', 'in_transit']
    )
    
    for delivery in active_deliveries:
        delivery.current_location = {
            'lat': float(data.get('latitude')),
            'lng': float(data.get('longitude'))
        }
        delivery.save()
        
        RoutePoint.objects.create(
            delivery_tracking=delivery,
            latitude=data.get('latitude'),
            longitude=data.get('longitude'),
            speed=data.get('speed')
        )
    
    serializer = ShipperLocationSerializer(location)
    return Response(serializer.data, status=status.HTTP_201_CREATED)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_nearby_shippers(request):
    """Get nearby available shippers"""
    lat = float(request.GET.get('latitude', 0))
    lng = float(request.GET.get('longitude', 0))
    radius = float(request.GET.get('radius', 5))  # km
    
    nearby_shippers = []
    recent_locations = ShipperLocation.objects.filter(
        timestamp__gte=timezone.now() - timezone.timedelta(minutes=10),
        is_active=True
    ).select_related('shipper__userprofile')
    
    for location in recent_locations:
        if location.shipper.userprofile.user_type == 'shipper':
            distance = calculate_distance(lat, lng, 
                                        float(location.latitude), 
                                        float(location.longitude))
            if distance <= radius:
                nearby_shippers.append({
                    'shipper_id': location.shipper.id,
                    'name': location.shipper.get_full_name(),
                    'phone': location.shipper.userprofile.phone,
                    'latitude': location.latitude,
                    'longitude': location.longitude,
                    'distance': round(distance, 2),
                    'last_update': location.timestamp
                })
    
    return Response(nearby_shippers)

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points using Haversine formula"""
    R = 6371  # Earth's radius in kilometers
    
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = (math.sin(dlat/2) * math.sin(dlat/2) + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
         math.sin(dlon/2) * math.sin(dlon/2))
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    distance = R * c
    
    return distance

class DeliveryTrackingListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DeliveryTrackingCreateSerializer
        return DeliveryTrackingSerializer
    
    def get_queryset(self):
        user = self.request.user
        if user.userprofile.user_type == 'shipper':
            return DeliveryTracking.objects.filter(shipper=user)
        elif user.userprofile.user_type == 'customer':
            return DeliveryTracking.objects.filter(order__customer=user)
        return DeliveryTracking.objects.all()
    
    def perform_create(self, serializer):
        serializer.save(shipper=self.request.user)

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_delivery_status(request, tracking_id):
    """Update delivery status"""
    tracking = get_object_or_404(DeliveryTracking, id=tracking_id)
    
    if request.user != tracking.shipper:
        return Response({'error': 'Không có quyền cập nhật'}, 
                       status=status.HTTP_403_FORBIDDEN)
    
    new_status = request.data.get('status')
    tracking.status = new_status
    
    if new_status == 'picked_up':
        tracking.actual_pickup_time = timezone.now()
    elif new_status == 'delivered':
        tracking.actual_delivery_time = timezone.now()
    
    tracking.save()
    
    if new_status == 'delivered':
        tracking.order.status = 'delivered'
        tracking.order.save()
    
    serializer = DeliveryTrackingSerializer(tracking)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_order_tracking(request, order_id):
    """Get tracking info for specific order"""
    order = get_object_or_404(Order, id=order_id)
    
    if (request.user != order.customer and 
        request.user.userprofile.user_type not in ['admin', 'shipper']):
        return Response({'error': 'Không có quyền xem'}, 
                       status=status.HTTP_403_FORBIDDEN)
    
    try:
        tracking = DeliveryTracking.objects.get(order=order)
        serializer = DeliveryTrackingSerializer(tracking)
        return Response(serializer.data)
    except DeliveryTracking.DoesNotExist:
        return Response({'error': 'Không tìm thấy thông tin tracking'}, 
                       status=status.HTTP_404_NOT_FOUND)
