from rest_framework import generics, filters, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db import models
from django.db.models import Q, Count, Avg, F
from django.shortcuts import get_object_or_404
from .models import Category, Restaurant, Food, Province, Banner, Review, Promotion
from .serializers import (
    CategorySerializer,
    RestaurantSerializer,
    FoodSerializer,
    ProvinceSerializer,
    BannerSerializer,
    ReviewSerializer,
    CategoryWithFoodsSerializer,
    PromotionSerializer,
)


class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.filter(is_active=True).order_by("id")
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]


class CategoryWithFoodsListView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = CategoryWithFoodsSerializer

    def get_queryset(self):
        limit = self.request.query_params.get('limit')
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 5

        qs = Category.objects.filter(is_active=True).prefetch_related(
            models.Prefetch(
                'food_set',
                queryset=Food.objects.filter(is_available=True, restaurant__is_active=True)
                .select_related('restaurant')
                .order_by('-rating', '-total_orders'),
                to_attr='available_foods'
            )
        ).order_by('id')

        self.foods_limit = limit
        return qs

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['foods_limit'] = getattr(self, 'foods_limit', 5)
        return context

class RestaurantListView(generics.ListAPIView):
    queryset = Restaurant.objects.filter(is_active=True).order_by('-rating', '-created_at')
    serializer_class = RestaurantSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_open']
    search_fields = ['name', 'description', 'address']
    ordering_fields = ['rating', 'created_at', 'delivery_fee']
    ordering = ['-rating']
    
    def get_queryset(self):
        qs = Restaurant.objects.filter(is_active=True)
        # Optional location-based filtering
        lat = self.request.query_params.get('lat')
        lng = self.request.query_params.get('lng')
        radius_km = self.request.query_params.get('radius_km')
        try:
            if lat is not None and lng is not None:
                lat = float(lat)
                lng = float(lng)
                radius_km = float(radius_km) if radius_km is not None else 5.0
                # Rough bounding box using ~111km per degree latitude
                lat_delta = radius_km / 111.0
                # Prevent division by zero near the poles; cos expects radians
                import math
                cos_lat = math.cos(math.radians(lat))
                cos_lat = cos_lat if abs(cos_lat) > 1e-6 else 1e-6
                lng_delta = radius_km / (111.0 * cos_lat)

                min_lat = lat - lat_delta
                max_lat = lat + lat_delta
                min_lng = lng - lng_delta
                max_lng = lng + lng_delta

                qs = qs.filter(latitude__isnull=False, longitude__isnull=False,
                               latitude__gte=min_lat, latitude__lte=max_lat,
                               longitude__gte=min_lng, longitude__lte=max_lng)
        except (ValueError, TypeError):
            # If invalid params, ignore location filtering
            pass
        return qs


# ================== Province Views ==================
class ProvinceListPublicView(generics.ListAPIView):
    queryset = Province.objects.all().order_by('name')
    serializer_class = ProvinceSerializer
    permission_classes = [permissions.AllowAny]


class ProvinceDetailPublicView(generics.RetrieveAPIView):
    queryset = Province.objects.all()
    serializer_class = ProvinceSerializer
    permission_classes = [permissions.AllowAny]


class ProvinceListCreateAdminView(generics.ListCreateAPIView):
    queryset = Province.objects.all().order_by('name')
    serializer_class = ProvinceSerializer
    permission_classes = [permissions.IsAdminUser]


class ProvinceDetailAdminView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Province.objects.all()
    serializer_class = ProvinceSerializer
    permission_classes = [permissions.IsAdminUser]

class RestaurantDetailView(generics.RetrieveAPIView):
    queryset = Restaurant.objects.filter(is_active=True)
    serializer_class = RestaurantSerializer
    permission_classes = [permissions.AllowAny]

class FoodListView(generics.ListAPIView):
    serializer_class = FoodSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['restaurant', 'category', 'is_featured']
    search_fields = ['name', 'description', 'ingredients']
    ordering_fields = ['price', 'rating', 'total_orders', 'created_at']
    ordering = ['-rating']
    
    def get_queryset(self):
        return Food.objects.filter(is_available=True, restaurant__is_active=True).order_by('-rating', '-created_at')

class FoodDetailView(generics.RetrieveAPIView):
    queryset = Food.objects.filter(is_available=True).order_by('-id')
    serializer_class = FoodSerializer
    permission_classes = [permissions.AllowAny]

class RestaurantFoodListView(generics.ListAPIView):
    serializer_class = FoodSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['category']
    search_fields = ['name', 'description']
    
    def get_queryset(self):
        restaurant_id = self.kwargs['restaurant_id']
        return Food.objects.filter(
            restaurant_id=restaurant_id,
            is_available=True,
            restaurant__is_active=True
        )

## Removed FoodReview, Banner, Promotion, SellerPost related views
class BannerListView(generics.ListAPIView):
    serializer_class = BannerSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        from django.utils import timezone
        now = timezone.now()
        qs = Banner.objects.filter(is_active=True)
        # If your Banner has optional date range, return active within range when provided
        if hasattr(Banner, 'start_date') and hasattr(Banner, 'end_date'):
            qs = qs.filter(
                (Q(start_date__lte=now) | Q(start_date__isnull=True)),
                (Q(end_date__gte=now) | Q(end_date__isnull=True)),
            )
        return qs.order_by('order', '-created_at')

class MyFoodListView(generics.ListCreateAPIView):
    serializer_class = FoodSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        restaurant, _ = Restaurant.objects.get_or_create(
            owner=self.request.user,
            defaults={
                'name': f'Nhà hàng của {self.request.user.get_full_name() or self.request.user.username}',
                'description': 'Mô tả nhà hàng',
                'address': 'Địa chỉ nhà hàng',
                'phone': getattr(self.request.user, 'phone_number', '') or '',
                'opening_time': '08:00',
                'closing_time': '22:00',
            }
        )
        return Food.objects.filter(restaurant=restaurant).order_by('-created_at')
    
    def perform_create(self, serializer):
        restaurant, _ = Restaurant.objects.get_or_create(
            owner=self.request.user,
            defaults={
                'name': f'Nhà hàng của {self.request.user.get_full_name() or self.request.user.username}',
                'description': 'Mô tả nhà hàng',
                'address': 'Địa chỉ nhà hàng',
                'phone': getattr(self.request.user, 'phone_number', '') or '',
                'opening_time': '08:00',
                'closing_time': '22:00',
            }
        )
        serializer.save(restaurant=restaurant)

class MyRestaurantView(generics.RetrieveUpdateAPIView):
    serializer_class = RestaurantSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        restaurant, _ = Restaurant.objects.get_or_create(
            owner=self.request.user,
            defaults={
                'name': f'Nhà hàng của {self.request.user.get_full_name() or self.request.user.username}',
                'description': 'Mô tả nhà hàng',
                'address': 'Địa chỉ nhà hàng',
                'phone': getattr(self.request.user, 'phone_number', '') or '',
                'opening_time': '08:00',
                'closing_time': '22:00',
            }
        )
        return restaurant

class RestaurantPromotionsView(generics.ListCreateAPIView):
    """
    GET: List all promotions for the authenticated restaurant owner
    POST: Create a new promotion for the restaurant
    """
    serializer_class = PromotionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Only return promotions for the authenticated user's restaurant
        return Promotion.objects.filter(
            restaurant__owner=self.request.user
        ).order_by('-created_at')

    def perform_create(self, serializer):
        # Automatically set the restaurant to the owner's restaurant
        restaurant = self.request.user.restaurant
        serializer.save(restaurant=restaurant)


class PromotionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Get promotion details
    PUT/PATCH: Update promotion
    DELETE: Delete promotion
    """
    serializer_class = PromotionSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_url_kwarg = 'promotion_id'

    def get_queryset(self):
        # Only allow access to promotions owned by the authenticated user
        return Promotion.objects.filter(restaurant__owner=self.request.user)


class MyFoodDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FoodSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        restaurant = Restaurant.objects.filter(owner=self.request.user).first()
        if restaurant:
            return Food.objects.filter(restaurant=restaurant).order_by('-created_at')
        return Food.objects.none()

    def perform_destroy(self, instance):
        """Thực hiện soft delete thay vì hard delete."""
        instance.is_available = False
        instance.quantity = 0
        instance.save()

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def search_foods(request):
    query = request.GET.get('q', '')
    if not query:
        return Response({'results': []})
    
    foods = Food.objects.filter(
        Q(name__icontains=query) | 
        Q(description__icontains=query) |
        Q(ingredients__icontains=query),
        is_available=True,
        restaurant__is_active=True
    )[:20]
    
    serializer = FoodSerializer(foods, many=True)
    return Response({'results': serializer.data})


class FoodReviewsListCreateView(generics.ListCreateAPIView):
    """GET: list reviews for a food (public)
       POST: create a review for a food (auth required)
    """
    serializer_class = ReviewSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        food_id = self.kwargs['food_id']
        return Review.objects.filter(food_id=food_id)

    def perform_create(self, serializer):
        food_id = self.kwargs['food_id']
        serializer.save(user=self.request.user, food_id=food_id)


class ReviewCreateView(generics.CreateAPIView):
    """POST body includes food, rating, comment"""
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def food_rating_stats(request, food_id):
    qs = Review.objects.filter(food_id=food_id)
    total = qs.count()
    avg = qs.aggregate(a=Avg('rating'))['a'] or 0
    dist = qs.values('rating').annotate(c=Count('id')).order_by('rating')
    # Normalize to 1..5 keys
    counts = {i: 0 for i in range(1,6)}
    for row in dist:
        r = int(row['rating'])
        if 1 <= r <= 5:
            counts[r] = row['c']
    return Response({
        'total': total,
        'average': avg,
        'counts': counts,
    })


class FoodSuggestionsView(generics.ListAPIView):
    serializer_class = FoodSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        food_id = self.kwargs.get('food_id')
        try:
            food = Food.objects.select_related('category', 'restaurant').get(id=food_id)
        except Food.DoesNotExist:
            return Food.objects.none()

        # Lấy các món ăn thay thế
        # Ưu tiên 1: Cùng nhà hàng và cùng danh mục
        # Ưu tiên 2: Cùng nhà hàng, các danh mục khác
        # Ưu tiên 3: Cùng danh mục, các nhà hàng khác
        # Loại trừ món ăn hiện tại và các món đã hết hàng
        queryset = Food.objects.filter(
            is_available=True, 
            quantity__gt=0
        ).exclude(id=food_id)

        # Sắp xếp theo mức độ ưu tiên
        queryset = queryset.annotate(
            priority=models.Case(
                models.When(restaurant=food.restaurant, category=food.category, then=models.Value(1)),
                models.When(restaurant=food.restaurant, then=models.Value(2)),
                models.When(category=food.category, then=models.Value(3)),
                default=models.Value(4),
                output_field=models.IntegerField(),
            )
        ).order_by('priority', '-total_orders', '-rating')

        return queryset[:10]  # Giới hạn 10 món gợi ý

@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def restaurant_rating_stats(request, restaurant_id):
    qs = Review.objects.filter(food__restaurant_id=restaurant_id)
    total = qs.count()
    avg = qs.aggregate(a=Avg('rating'))['a'] or 0
    dist = qs.values('rating').annotate(c=Count('id')).order_by('rating')
    counts = {i: 0 for i in range(1, 6)}
    for row in dist:
        r = int(row['rating'])
        if 1 <= r <= 5:
            counts[r] = row['c']
    return Response({
        'restaurant_id': restaurant_id,
        'total': total,
        'average': avg,
        'counts': counts,
    })
