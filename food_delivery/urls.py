from django.contrib import admin
from django.urls import path, include
from django.conf.urls.static import static
from django.conf import settings
from home import views as home_views
from restaurants.seller_admin import seller_admin_site
from food_delivery.admin import custom_admin_site

urlpatterns = [
    path('', home_views.web_home, name='web_home'),
    path('restaurants/<int:restaurant_id>/', home_views.web_restaurant_detail, name='web_restaurant_detail'),
    path('foods/<int:food_id>/', home_views.web_food_detail, name='web_food_detail'),
    path('admin/', custom_admin_site.urls),
    path('seller/', seller_admin_site.urls),  # Seller Dashboard
    path("api/auth/", include("accounts.urls")),  
    path("api/restaurants/", include("restaurants.urls")),
    path("api/orders/", include("orders.urls")),
    path("api/payments/", include("payments.urls")),
    path("api/ai/", include("ai_features.urls")),
    path("api/home/", include("home.urls")),
    path("api/admin/", include("admin_dashboard.urls")),
]

if settings.DEBUG:
    if hasattr(settings, "MEDIA_URL") and hasattr(settings, "MEDIA_ROOT"):
        urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    if hasattr(settings, "STATIC_URL") and hasattr(settings, "STATIC_ROOT"):
        urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)