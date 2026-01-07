from django.db import models
from django.contrib.auth import get_user_model
"""
Models for restaurants app.
"""

User = get_user_model()

class Category(models.Model):
    name = models.CharField(max_length=100, verbose_name='Tên danh mục')
    description = models.TextField(blank=True, verbose_name='Mô tả')
    image = models.ImageField(upload_to='categories/', blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Danh mục'
        verbose_name_plural = 'Danh mục'
    
    def __str__(self):
        return self.name

class Province(models.Model):
    name = models.CharField(max_length=120, unique=True, verbose_name='Tỉnh/Thành phố')
    center_latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    center_longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    default_radius_km = models.DecimalField(max_digits=5, decimal_places=1, default=5.0)

    class Meta:
        verbose_name = 'Khu vực (Tỉnh/Thành)'
        verbose_name_plural = 'Khu vực (Tỉnh/Thành)'

    def __str__(self):
        return self.name

class Restaurant(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='restaurants')
    name = models.CharField(max_length=200, verbose_name='Tên nhà hàng')
    description = models.TextField(blank=True, verbose_name='Mô tả')
    address = models.TextField(verbose_name='Địa chỉ')
    phone = models.CharField(max_length=20, verbose_name='Số điện thoại')
    email = models.EmailField(blank=True, verbose_name='Email')

    # Khu vực (tỉnh/thành)
    province = models.ForeignKey(Province, on_delete=models.SET_NULL, null=True, blank=True, related_name='restaurants', verbose_name='Tỉnh/Thành')

    # Thông tin vị trí
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)

    # Hình ảnh
    logo = models.ImageField(upload_to='restaurants/logos/', blank=True, null=True)
    cover_image = models.ImageField(upload_to='restaurants/covers/', blank=True, null=True)

    # Thông tin hoạt động
    is_active = models.BooleanField(default=True)
    is_open = models.BooleanField(default=True)
    opening_time = models.TimeField(verbose_name='Giờ mở cửa')
    closing_time = models.TimeField(verbose_name='Giờ đóng cửa')

    # Đánh giá
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.0)
    total_reviews = models.IntegerField(default=0)

    # Phí giao hàng
    delivery_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    min_order_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Nhà hàng'
        verbose_name_plural = 'Nhà hàng'

    def __str__(self):
        return self.name

class Food(models.Model):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='foods')
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=200, verbose_name='Tên món ăn')
    description = models.TextField(blank=True, verbose_name='Mô tả')
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='Giá')
    discount_price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    
    # Hình ảnh
    image = models.ImageField(upload_to='foods/', verbose_name='Hình ảnh', blank=True, null=True)
    
    # Thông tin món ăn
    ingredients = models.TextField(blank=True, verbose_name='Nguyên liệu')
    calories = models.IntegerField(blank=True, null=True, verbose_name='Calories')
    preparation_time = models.IntegerField(default=15, verbose_name='Thời gian chuẩn bị (phút)')
    
    # Trạng thái
    is_available = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    quantity = models.PositiveIntegerField(default=100, verbose_name='Số lượng còn lại trong ngày') # Số lượng món ăn còn lại

    @property
    def current_price(self):
        """Trả về giá đã giảm nếu có, ngược lại trả về giá gốc."""
        return self.discount_price if self.discount_price is not None and self.discount_price < self.price else self.price
    
    # Đánh giá
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.0)
    total_reviews = models.IntegerField(default=0)
    
    # Thống kê
    total_orders = models.IntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Món ăn'
        verbose_name_plural = 'Món ăn'
    
    def __str__(self):
        return f"{self.name} - {self.restaurant.name}"

## Removed FoodReview model (not needed for now)

class Review(models.Model):
    """Đánh giá món ăn"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='food_reviews')
    food = models.ForeignKey(Food, on_delete=models.CASCADE, related_name='reviews')
    rating = models.IntegerField(default=5)
    comment = models.TextField(blank=True)
    image = models.ImageField(upload_to='reviews/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Đánh giá món'
        verbose_name_plural = 'Đánh giá món'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.food.name} - {self.rating}⭐ by {self.user}"

class Banner(models.Model):
    title = models.CharField(max_length=200, verbose_name='Tiêu đề')
    description = models.TextField(blank=True, verbose_name='Mô tả')
    image = models.ImageField(upload_to='banners/', verbose_name='Hình ảnh')
    link_url = models.URLField(blank=True, verbose_name='Liên kết')
    
    # Liên kết đến restaurant hoặc food
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, blank=True, null=True)
    food = models.ForeignKey(Food, on_delete=models.CASCADE, blank=True, null=True)
    
    is_active = models.BooleanField(default=True)
    order = models.IntegerField(default=0, verbose_name='Thứ tự hiển thị')
    
    start_date = models.DateTimeField(null=True, blank=True, verbose_name='Ngày bắt đầu')
    end_date = models.DateTimeField(null=True, blank=True, verbose_name='Ngày kết thúc')
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Banner'
        verbose_name_plural = 'Banner'
        ordering = ['order', '-created_at']
    
    def __str__(self):
        return self.title


class Promotion(models.Model):
    PROMOTION_TYPES = [
        ('PERCENTAGE', 'Phần trăm giảm giá'),
        ('FIXED_AMOUNT', 'Giảm giá cố định'),
        ('BUY_X_GET_Y', 'Mua X tặng Y'),
        ('FREE_SHIPPING', 'Miễn phí vận chuyển'),
    ]
    
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='promotions')
    title = models.CharField(max_length=200, verbose_name='Tiêu đề')
    description = models.TextField(blank=True, verbose_name='Mô tả')
    image = models.ImageField(upload_to='promotions/', blank=True, null=True)
    promo_type = models.CharField(max_length=20, choices=PROMOTION_TYPES, default='PERCENTAGE', verbose_name='Loại khuyến mãi')
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name='Giá trị khuyến mãi')
    min_order_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name='Đơn hàng tối thiểu')
    max_discount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name='Giảm giá tối đa')
    
    # Promotion period
    start_date = models.DateTimeField(null=True, blank=True, verbose_name='Ngày bắt đầu')
    end_date = models.DateTimeField(null=True, blank=True, verbose_name='Ngày kết thúc')
    is_active = models.BooleanField(default=True, verbose_name='Đang hoạt động')
    
    # Applicable to specific foods or all foods
    apply_to_all = models.BooleanField(default=True, verbose_name='Áp dụng cho tất cả món')
    foods = models.ManyToManyField('Food', related_name='promotions', blank=True, verbose_name='Món ăn áp dụng')
    
    # Usage limits
    usage_limit = models.PositiveIntegerField(null=True, blank=True, verbose_name='Giới hạn sử dụng')
    times_used = models.PositiveIntegerField(default=0, verbose_name='Đã sử dụng')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Khuyến mãi'
        verbose_name_plural = 'Khuyến mãi'
        ordering = ['-is_active', '-created_at']

    def __str__(self):
        return f"{self.title} - {self.restaurant.name}"
        
    def is_valid(self):
        """Check if the promotion is currently valid"""
        from django.utils import timezone
        now = timezone.now()
        
        if not self.is_active:
            return False
            
        if self.start_date and now < self.start_date:
            return False
            
        if self.end_date and now > self.end_date:
            return False
            
        if self.usage_limit is not None and self.times_used >= self.usage_limit:
            return False
            
        return True
        
    def apply_discount(self, food, quantity=1, order_total=0):
        """Apply discount to a food item or order"""
        if not self.is_valid():
            return 0
            
        # Check if promotion applies to this food
        if not self.apply_to_all and not self.foods.filter(id=food.id).exists():
            return 0
            
        # Check minimum order amount
        if order_total < self.min_order_amount:
            return 0
            
        if self.promo_type == 'PERCENTAGE':
            discount = (food.price * self.discount_value / 100) * quantity
            if self.max_discount:
                discount = min(discount, self.max_discount)
            return discount
            
        elif self.promo_type == 'FIXED_AMOUNT':
            return min(food.price * quantity, self.discount_value * quantity)
            
        # Add more promotion types as needed
        
        return 0


class SellerPost(models.Model):
    """Bài đăng của nhà bán hàng (dùng để đăng sản phẩm / quảng bá bán hàng)"""
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='posts')
    title = models.CharField(max_length=255, verbose_name='Tiêu đề')
    description = models.TextField(blank=True, verbose_name='Mô tả')
    image = models.ImageField(upload_to='seller_posts/', blank=True, null=True, verbose_name='Hình ảnh')
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='seller_posts')
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name='Giá (nếu có)')
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Bài đăng bán hàng'
        verbose_name_plural = 'Bài đăng bán hàng'

    def __str__(self):
        return f"{self.title} - {self.restaurant.name}"
