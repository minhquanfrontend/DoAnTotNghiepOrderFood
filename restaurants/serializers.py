from rest_framework import serializers
from .models import Category, Restaurant, Food, Province, Banner, Review, Promotion

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'


class ProvinceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Province
        fields = '__all__'

class RestaurantSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.get_full_name', read_only=True)
    province_name = serializers.CharField(source='province.name', read_only=True)
    
    class Meta:
        model = Restaurant
        fields = '__all__'
        read_only_fields = ('owner', 'rating', 'total_reviews')

class FoodSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    current_price = serializers.SerializerMethodField()
    
    class Meta:
        model = Food
        fields = '__all__'
        read_only_fields = ('restaurant', 'rating', 'total_reviews', 'total_orders')
    
    def get_current_price(self, obj):
        return obj.discount_price if obj.discount_price else obj.price


class BannerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Banner
        fields = '__all__'


class ReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Review
        fields = ['id', 'food', 'user', 'user_name', 'rating', 'comment', 'created_at']
        read_only_fields = ['user', 'created_at']

    def get_user_name(self, obj):
        try:
            full = obj.user.get_full_name()
            return full or obj.user.username
        except Exception:
            return ''


class FoodSimpleSerializer(serializers.ModelSerializer):
    """Simplified food serializer for listing in promotions"""
    class Meta:
        model = Food
        fields = ['id', 'name', 'price', 'image']
        read_only_fields = fields


class PromotionSerializer(serializers.ModelSerializer):
    """Serializer for promotion management"""
    foods = FoodSimpleSerializer(many=True, read_only=True)
    food_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Food.objects.all(),
        source='foods',
        required=False,
        write_only=True
    )
    is_valid = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Promotion
        fields = [
            'id', 'title', 'description', 'image', 'promo_type', 'discount_value',
            'min_order_amount', 'max_discount', 'start_date', 'end_date',
            'is_active', 'apply_to_all', 'foods', 'food_ids', 'usage_limit',
            'times_used', 'created_at', 'updated_at', 'is_valid'
        ]
        read_only_fields = ('restaurant', 'created_at', 'updated_at', 'times_used')
    
    def validate(self, data):
        """Validate promotion data"""
        # Ensure end date is after start date if both are provided
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        
        if start_date and end_date and end_date <= start_date:
            raise serializers.ValidationError({
                'end_date': 'Ngày kết thúc phải sau ngày bắt đầu.'
            })
            
        # Validate discount values based on promotion type
        promo_type = data.get('promo_type', 'PERCENTAGE')
        discount_value = data.get('discount_value', 0)
        
        if promo_type == 'PERCENTAGE' and (discount_value <= 0 or discount_value > 100):
            raise serializers.ValidationError({
                'discount_value': 'Giá trị giảm giá phải từ 1% đến 100%.'
            })
            
        elif promo_type == 'FIXED_AMOUNT' and discount_value <= 0:
            raise serializers.ValidationError({
                'discount_value': 'Giá trị giảm giá phải lớn hơn 0.'
            })
            
        return data
    
    def create(self, validated_data):
        """Create a new promotion"""
        # Set the restaurant to the current user's restaurant
        validated_data['restaurant'] = self.context['request'].user.restaurant
        return super().create(validated_data)


class CategoryWithFoodsSerializer(serializers.ModelSerializer):
    foods = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = '__all__'

    def get_foods(self, obj):
        limit = self.context.get('foods_limit', 5)
        foods = getattr(obj, 'available_foods', None)

        if foods is None:
            foods_qs = Food.objects.filter(
                category=obj,
                is_available=True,
                restaurant__is_active=True
            ).select_related('restaurant')
        else:
            foods_qs = foods

        foods_list = list(foods_qs)[:limit]
        serializer = FoodSerializer(foods_list, many=True, context=self.context)
        return serializer.data
