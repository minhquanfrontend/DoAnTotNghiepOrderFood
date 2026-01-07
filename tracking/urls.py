from django.urls import path
from . import views

urlpatterns = [
    # Shipper location endpoints
    path('shipper-locations/', views.ShipperLocationListCreateView.as_view(), name='shipper-locations'),
    path('update-location/', views.update_shipper_location, name='update-location'),
    path('nearby-shippers/', views.get_nearby_shippers, name='nearby-shippers'),
    
    # Delivery tracking endpoints
    path('deliveries/', views.DeliveryTrackingListCreateView.as_view(), name='delivery-tracking'),
    path('deliveries/<int:tracking_id>/status/', views.update_delivery_status, name='update-delivery-status'),
    path('orders/<int:order_id>/tracking/', views.get_order_tracking, name='order-tracking'),
]
