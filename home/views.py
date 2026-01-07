from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.shortcuts import get_object_or_404, render
from restaurants.models import Category, Restaurant, Banner, Food, Review
from restaurants.serializers import CategorySerializer, RestaurantSerializer, BannerSerializer

@api_view(["GET"])
def home_api(request):
    banners = Banner.objects.all()[:5]
    categories = Category.objects.all()[:10]
    restaurants = Restaurant.objects.filter(is_active=True)[:10]

    return Response({
        "banners": BannerSerializer(banners, many=True).data,
        "categories": CategorySerializer(categories, many=True).data,
        "restaurants": RestaurantSerializer(restaurants, many=True).data,
    })


def web_home(request):
    banners = Banner.objects.all()[:5]
    categories = Category.objects.filter(is_active=True).order_by("id")[:12]
    restaurants = Restaurant.objects.filter(is_active=True).order_by("-rating", "-created_at")[:12]
    foods = Food.objects.filter(is_available=True, restaurant__is_active=True).select_related("restaurant").order_by("-rating", "-total_orders")[:12]
    return render(request, "web/index.html", {
        "banners": banners,
        "categories": categories,
        "restaurants": restaurants,
        "foods": foods,
    })


def web_restaurant_detail(request, restaurant_id):
    restaurant = get_object_or_404(Restaurant, id=restaurant_id, is_active=True)
    foods = Food.objects.filter(restaurant=restaurant, is_available=True).order_by("-rating", "-created_at")
    return render(request, "web/restaurant_detail.html", {
        "restaurant": restaurant,
        "foods": foods,
    })


def web_food_detail(request, food_id):
    food = get_object_or_404(Food.objects.select_related("restaurant"), id=food_id, is_available=True)
    reviews = Review.objects.filter(food=food).select_related("user").order_by("-created_at")[:20]
    return render(request, "web/food_detail.html", {
        "food": food,
        "restaurant": food.restaurant,
        "reviews": reviews,
    })
