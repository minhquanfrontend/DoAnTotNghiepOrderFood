from django.urls import path
from . import views

app_name = 'admin_dashboard'

urlpatterns = [
    # System Overview
    path('overview/', views.system_overview, name='system-overview'),
    path('revenue/', views.revenue_analytics, name='revenue-analytics'),
    
    # Seller Performance
    path('sellers/performance/', views.seller_performance, name='seller-performance'),
    
    # Operational Monitoring
    path('operations/issues/', views.operational_issues, name='operational-issues'),
    
    # Admin Actions - Restaurants
    path('restaurants/', views.list_restaurants, name='list-restaurants'),
    path('restaurants/<int:restaurant_id>/block/', views.block_restaurant, name='block-restaurant'),
    path('restaurants/<int:restaurant_id>/unblock/', views.unblock_restaurant, name='unblock-restaurant'),
    
    # Admin Actions - Shippers
    path('shippers/<int:shipper_id>/block/', views.block_shipper, name='block-shipper'),
    path('shippers/<int:shipper_id>/unblock/', views.unblock_shipper, name='unblock-shipper'),
    
    # Admin Actions - Orders
    path('orders/<int:order_id>/intervene/', views.intervene_order, name='intervene-order'),
    
    # User Management
    path('users/', views.list_users, name='list-users'),
    path('users/<int:user_id>/role/', views.update_user_role, name='update-user-role'),
]
