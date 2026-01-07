"""
Admin Dashboard Web Views
Render HTML templates for admin dashboard
"""
from django.shortcuts import render, redirect
from django.contrib.admin.views.decorators import staff_member_required


@staff_member_required
def dashboard(request):
    """Main dashboard page"""
    return render(request, 'admin/dashboard.html')


@staff_member_required
def orders_page(request):
    """Orders management page"""
    return render(request, 'admin/orders.html')


@staff_member_required
def restaurants_page(request):
    """Restaurants management page"""
    return render(request, 'admin/restaurants.html')


@staff_member_required
def users_page(request):
    """Users management page"""
    return render(request, 'admin/users.html')


@staff_member_required
def shippers_page(request):
    """Shippers management page"""
    return render(request, 'admin/shippers.html')


@staff_member_required
def revenue_page(request):
    """Revenue analytics page"""
    return render(request, 'admin/revenue.html')
