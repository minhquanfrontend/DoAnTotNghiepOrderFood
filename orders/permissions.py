from rest_framework.permissions import BasePermission
from restaurants.models import Restaurant

class IsOwnerOrAdmin(BasePermission):
    """
    Custom permission to only allow owners of an object or admins to view/edit it.
    Assumes the object has a 'customer' attribute.
    """
    def has_object_permission(self, request, view, obj):
        # Admin users can access anything.
        if request.user and request.user.is_staff:
            return True
        # The owner of the order can access it.
        return obj.customer == request.user

class IsSellerOfOrder(BasePermission):
    """
    Permission to check if the user is the seller (owner) of the restaurant for the order.
    """
    def has_object_permission(self, request, view, obj):
        if request.user and request.user.is_staff:
            return True
        # Check if the user owns the restaurant associated with the order.
        return obj.restaurant.owner == request.user

class IsShipperOfOrder(BasePermission):
    """
    Permission to check if the user is the shipper assigned to the order.
    """
    def has_object_permission(self, request, view, obj):
        if request.user and request.user.is_staff:
            return True
        # Check if the user is the shipper for the order.
        return obj.shipper == request.user
