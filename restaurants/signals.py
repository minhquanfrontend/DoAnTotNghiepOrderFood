from decimal import Decimal, ROUND_HALF_UP
import requests
import logging

from django.db.models import Avg, Count
from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver

from .models import Food, Restaurant, Review

logger = logging.getLogger(__name__)


def _normalize_rating(value):
    if value is None:
        return Decimal("0.00")
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _update_food_rating(food_id):
    if not food_id:
        return
    stats = Review.objects.filter(food_id=food_id).aggregate(avg=Avg("rating"), total=Count("id"))
    avg = _normalize_rating(stats.get("avg"))
    total = stats.get("total", 0) or 0
    Food.objects.filter(id=food_id).update(rating=avg, total_reviews=total)


def _update_restaurant_rating(restaurant_id):
    if not restaurant_id:
        return
    stats = Review.objects.filter(food__restaurant_id=restaurant_id).aggregate(avg=Avg("rating"), total=Count("id"))
    avg = _normalize_rating(stats.get("avg"))
    total = stats.get("total", 0) or 0
    Restaurant.objects.filter(id=restaurant_id).update(rating=avg, total_reviews=total)


def _sync_related_ratings(review: Review):
    food_id = getattr(review, "food_id", None)
    restaurant_id = getattr(review.food, "restaurant_id", None) if review.food_id else None
    _update_food_rating(food_id)
    _update_restaurant_rating(restaurant_id)


@receiver(post_save, sender=Review)
def update_ratings_on_save(sender, instance, **kwargs):
    _sync_related_ratings(instance)


@receiver(post_delete, sender=Review)
def update_ratings_on_delete(sender, instance, **kwargs):
    _sync_related_ratings(instance)


def geocode_address(address):
    """Geocode address to latitude/longitude using Nominatim"""
    if not address or len(address.strip()) < 5:
        return None, None
    
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            'q': address,
            'format': 'json',
            'limit': 1,
            'countrycodes': 'vn',
            'addressdetails': 1
        }
        headers = {
            'User-Agent': 'FoodDeliveryApp/1.0'
        }
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0:
                lat = Decimal(str(data[0]['lat']))
                lng = Decimal(str(data[0]['lon']))
                logger.info(f"Geocoded '{address}' to ({lat}, {lng})")
                return lat, lng
    except Exception as e:
        logger.error(f"Geocoding error for '{address}': {e}")
    
    return None, None


@receiver(pre_save, sender=Restaurant)
def auto_geocode_restaurant_address(sender, instance, **kwargs):
    """
    Tự động geocode địa chỉ nhà hàng khi:
    1. Địa chỉ mới được thêm
    2. Địa chỉ bị thay đổi
    3. Chưa có tọa độ
    """
    # Kiểm tra xem đây là update hay create
    if instance.pk:
        try:
            old_instance = Restaurant.objects.get(pk=instance.pk)
            address_changed = old_instance.address != instance.address
        except Restaurant.DoesNotExist:
            address_changed = True
    else:
        address_changed = True
    
    # Chỉ geocode nếu:
    # - Địa chỉ thay đổi, HOẶC
    # - Chưa có tọa độ và có địa chỉ
    should_geocode = (
        (address_changed and instance.address) or
        (not instance.latitude and not instance.longitude and instance.address)
    )
    
    if should_geocode:
        lat, lng = geocode_address(instance.address)
        if lat is not None and lng is not None:
            instance.latitude = lat
            instance.longitude = lng
            logger.info(f"Updated restaurant '{instance.name}' coordinates to ({lat}, {lng})")
