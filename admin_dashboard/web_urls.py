"""
Admin Dashboard Web URLs
URL patterns for admin web dashboard pages
"""
from django.urls import path
from . import web_views

app_name = 'admin_web'

urlpatterns = [
    path('', web_views.dashboard, name='dashboard'),
    path('orders/', web_views.orders_page, name='orders'),
    path('restaurants/', web_views.restaurants_page, name='restaurants'),
    path('users/', web_views.users_page, name='users'),
    path('shippers/', web_views.shippers_page, name='shippers'),
    path('revenue/', web_views.revenue_page, name='revenue'),
]
