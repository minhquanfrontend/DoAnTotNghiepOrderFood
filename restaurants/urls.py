from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

urlpatterns = [
    # Public APIs
    path('categories/', views.CategoryListView.as_view(), name='category_list'),
    path('categories-with-foods/', views.CategoryWithFoodsListView.as_view(), name='category_with_foods_list'),
    path('', views.RestaurantListView.as_view(), name='restaurant_list'),
    path('<int:pk>/', views.RestaurantDetailView.as_view(), name='restaurant_detail'),
    path('<int:restaurant_id>/foods/', views.RestaurantFoodListView.as_view(), name='restaurant_foods'),

    # Foods
    path('foods/', views.FoodListView.as_view(), name='food_list'),
    path('foods/<int:pk>/', views.FoodDetailView.as_view(), name='food_detail'),
    path('foods/search/', views.search_foods, name='search_foods'),
    path('foods/<int:food_id>/reviews/', views.FoodReviewsListCreateView.as_view(), name='food_reviews_list_create'),
    path('foods/<int:food_id>/suggestions/', views.FoodSuggestionsView.as_view(), name='food_suggestions'),
    path('reviews/create/', views.ReviewCreateView.as_view(), name='review_create'),

    # Banners
    path('banners/', views.BannerListView.as_view(), name='banner_list'),

    # Seller APIs
    path('my-restaurant/', views.MyRestaurantView.as_view(), name='my_restaurant'),
    path('my-foods/', views.MyFoodListView.as_view(), name='my_foods'),
    path('my-foods/<int:pk>/', views.MyFoodDetailView.as_view(), name='my_food_detail'),
    
    # Promotions
    path('my-promotions/', views.RestaurantPromotionsView.as_view(), name='my_promotions'),
    path('my-promotions/<int:promotion_id>/', views.PromotionDetailView.as_view(), name='promotion_detail'),

    # Province public APIs
    path('provinces/', views.ProvinceListPublicView.as_view(), name='province_list'),
    path('provinces/<int:pk>/', views.ProvinceDetailPublicView.as_view(), name='province_detail'),

    # Province admin APIs
    path('admin/provinces/', views.ProvinceListCreateAdminView.as_view(), name='province_admin_list_create'),
    path('admin/provinces/<int:pk>/', views.ProvinceDetailAdminView.as_view(), name='province_admin_detail'),
]
