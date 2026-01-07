from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Avg, Count
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import Food, Restaurant, Review


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
