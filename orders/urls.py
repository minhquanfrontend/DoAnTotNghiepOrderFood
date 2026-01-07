from django.urls import path
from . import views, views_tracking, views_revenue, views_seller, views_customer
from .views import UpdateShipperLocationView

urlpatterns = [
    # 🏠 Home / Dashboard
    path("home/", views.home_data, name="home"),

    # 🛒 Cart APIs
    path("cart/", views.CartView.as_view(), name="cart"),
    path("cart/add/", views.add_to_cart, name="add_to_cart"),
    path("cart/update/<int:item_id>/", views.update_cart_item, name="update_cart_item"),
    path("cart/remove/<int:item_id>/", views.remove_from_cart, name="remove_from_cart"),
    path("cart/clear/", views.clear_cart, name="clear_cart"),

    # 🧾 Customer Orders (Legacy)
    path("orders/create/", views.create_order, name="legacy_create_order"),
    path("orders/my/", views.MyOrdersView.as_view(), name="legacy_my_orders"),
    path("orders/<int:pk>/", views.OrderDetailView.as_view(), name="legacy_order_detail"),
    path("orders/<int:order_id>/cancel/", views.cancel_order, name="legacy_cancel_order"),
    path("orders/<int:order_id>/delete/", views.delete_order, name="legacy_delete_order"),

    # 💳 Payment/Checkout (Legacy)
    path("orders/checkout/", views.checkout_order, name="legacy_checkout"),
    path("orders/cart/checkout/", views.cart_checkout, name="legacy_cart_checkout"),

    # 🛒 Guest Checkout (No Login Required) - Shopee Food Style
    path("guest/order/", views.create_guest_order, name="guest_order"),
    path("guest/track/", views.track_guest_order, name="track_guest_order"),
    path("guest/confirm-delivery/", views.guest_confirm_delivery, name="guest_confirm_delivery"),

    # 🔍 Orders by status & tracking
    path("my/status/<str:status_code>/", views.my_orders_by_status, name="my_orders_by_status"),
    path("<int:order_id>/tracking/", views.order_tracking, name="order_tracking"),
    
    # 📦 Order tracking by order number (no auth required)
    path("track/", views_tracking.track_order_by_number, name="track_order_by_number"),
    path("today-count/", views_tracking.get_today_orders_count, name="today_orders_count"),
    path("unread-count/", views_tracking.get_unread_notifications_count, name="unread_notifications_count"),
    path("status-flow/", views_customer.get_order_status_flow, name="order_status_flow"),
    
    # 👤 Customer order actions
    path("guest/confirm-delivery/", views_customer.guest_confirm_delivery, name="guest_confirm_delivery"),
    path("<int:order_id>/confirm-delivery/", views_customer.customer_confirm_delivery, name="customer_confirm_delivery"),

    # 🍴 Seller (Restaurant) Order Flow - FIXED
    path("restaurant/orders/", views.RestaurantOrdersView.as_view(), name="restaurant_orders"),
    path("restaurant/stats/", views_seller.seller_dashboard, name="restaurant_stats"),
    path("restaurant/dashboard/", views_seller.seller_dashboard, name="seller_dashboard"),
    path("restaurant/orders/status/<str:status_code>/", views_seller.seller_orders_by_status, name="seller_orders_by_status"),
    path("restaurant/inventory/", views_seller.seller_food_inventory, name="seller_inventory"),
    path("restaurant/food/<int:food_id>/update/", views_seller.seller_update_food_quantity, name="seller_update_food"),
    
    # Seller order actions - STRICT flow (no skipping!)
    path("<int:order_id>/seller-update/", views_seller.seller_update_order, name="seller_update_order"),
    path("<int:order_id>/confirm/", views.confirm_order, name="confirm_order"),
    path("<int:order_id>/start-preparing/", views.start_preparing, name="start_preparing"),
    path("<int:order_id>/mark-ready/", views.mark_ready, name="mark_ready"),
    path("<int:order_id>/update-status/", views.update_order_status, name="update_order_status"),

    # 🚚 Shipper Delivery Flow (FULL)
    path("shipper/orders/available/", views.AvailableOrdersView.as_view(), name="available_orders"),
    path("shipper/orders/my/", views.MyDeliveryOrdersView.as_view(), name="my_delivery_orders"),  # ✅ FIXED missing endpoint
    path("shipper/earnings/", views_revenue.shipper_earnings, name="shipper_earnings"),

    path("shipper/orders/<int:order_id>/accept/", views.accept_order, name="accept_order"),
    path("shipper/orders/<int:order_id>/mark-picked-up/", views.mark_picked_up, name="mark_picked_up"),
    path("shipper/orders/<int:order_id>/start-delivering/", views.start_delivering, name="start_delivering"),
    path('shipper/delivered/<int:order_id>/', views.mark_delivered, name='shipper-mark-delivered'),

    # Shipper location tracking
    path('shipper/location/update/', UpdateShipperLocationView.as_view(), name='update-shipper-location'),

    # 📍 Map & Location APIs
    path("shipper/orders/<int:order_id>/map-data/", views.order_map_data, name="order_map_data"),
    path("shipper/orders/<int:order_id>/route-info/", views.shipper_route_info, name="shipper_route_info"),
    path("orders/<int:order_id>/update-restaurant-address/", views.update_restaurant_address, name="update_restaurant_address"),
]
