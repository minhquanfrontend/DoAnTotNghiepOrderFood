"""
Custom Admin Site with Dashboard Statistics
"""
from django.contrib import admin
from django.contrib.admin import AdminSite
from django.contrib.auth.models import Group
from food_delivery.dashboard_callback import dashboard_callback


class CustomAdminSite(AdminSite):
    """Custom Admin Site with dashboard statistics"""
    site_header = 'Food Delivery Admin'
    site_title = 'Food Delivery'
    index_title = 'Dashboard - Tổng quan hệ thống'
    index_template = 'admin/custom_index.html'
    
    def index(self, request, extra_context=None):
        """Override index to add dashboard statistics"""
        extra_context = extra_context or {}
        
        # Call dashboard callback to populate context
        dashboard_callback(request, extra_context)
        
        return super().index(request, extra_context)


# Create custom admin site instance
custom_admin_site = CustomAdminSite(name='custom_admin')

# Import and register all models from other apps
def register_all_models():
    """Register all models from other apps to custom admin site"""
    from accounts.models import User
    from restaurants.models import Restaurant, Food, Category, Province
    from orders.models import Order, OrderItem
    from payments.models import Payment
    
    # Import existing admin classes
    from accounts.admin import UserAdmin
    from restaurants.admin import RestaurantAdmin, FoodAdmin, CategoryAdmin
    from orders.admin import OrderAdmin
    from payments.admin import PaymentAdmin
    
    # Register to custom admin site
    custom_admin_site.register(User, UserAdmin)
    custom_admin_site.register(Group)
    custom_admin_site.register(Restaurant, RestaurantAdmin)
    custom_admin_site.register(Food, FoodAdmin)
    custom_admin_site.register(Category, CategoryAdmin)
    custom_admin_site.register(Province)
    custom_admin_site.register(Order, OrderAdmin)
    custom_admin_site.register(OrderItem)
    custom_admin_site.register(Payment, PaymentAdmin)

# Register models
register_all_models()
