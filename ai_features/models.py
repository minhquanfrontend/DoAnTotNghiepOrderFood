from django.db import models
from django.contrib.auth import get_user_model
from restaurants.models import Food, Restaurant
from orders.models import Order, OrderItem

User = get_user_model()

class UserPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='preferences')
    dietary_restrictions = models.JSONField(default=list, blank=True)
    favorite_cuisines = models.JSONField(default=list, blank=True)
    disliked_ingredients = models.JSONField(default=list, blank=True)
    budget_range = models.CharField(max_length=50, blank=True)
    last_updated = models.DateTimeField(auto_now=True)
    preferred_meal_times = models.JSONField(default=dict, blank=True)  # e.g., {"breakfast": "08:00", "lunch": "12:30", "dinner": "19:00"}
    
    def __str__(self):
        return f"{self.user.email}'s Preferences"

class FoodRecommendation(models.Model):
    """Model lưu trữ các gợi ý món ăn cho người dùng"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recommendations', verbose_name='Người dùng')
    food = models.ForeignKey(Food, on_delete=models.CASCADE, verbose_name='Món ăn')
    score = models.FloatField(verbose_name='Điểm gợi ý')
    reason = models.TextField(verbose_name='Lý do gợi ý')
    
    # Loại gợi ý
    RECOMMENDATION_TYPES = [
        ('collaborative', 'Lọc cộng tác'),
        ('content_based', 'Dựa trên nội dung'),
        ('hybrid', 'Kết hợp'),
        ('trending', 'Xu hướng'),
        ('similar_users', 'Người dùng tương tự'),
    ]
    recommendation_type = models.CharField(
        max_length=20, 
        choices=RECOMMENDATION_TYPES,
        verbose_name='Loại gợi ý'
    )
    
    is_clicked = models.BooleanField(default=False, verbose_name='Đã xem')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Ngày tạo')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Ngày cập nhật')
    
    class Meta:
        verbose_name = 'Gợi ý món ăn'
        verbose_name_plural = 'Gợi ý món ăn'
        unique_together = ['user', 'food']
        ordering = ['-score', '-created_at']
    
    def __str__(self):
        return f"{self.food.name} - {self.user.username} ({self.get_recommendation_type_display()}: {self.score:.2f})"

class ChatIntent(models.Model):
    """Store common user intents for the chatbot"""
    INTENT_TYPES = [
        ('greeting', 'Chào hỏi'),
        ('order_food', 'Đặt món'),
        ('ask_recommendation', 'Hỏi gợi ý'),
        ('check_order_status', 'Kiểm tra đơn hàng'),
        ('cancel_order', 'Hủy đơn hàng'),
        ('check_wallet', 'Kiểm tra ví'),
        ('topup_wallet', 'Nạp tiền vào ví'),
        ('ask_menu', 'Hỏi thực đơn'),
        ('ask_restaurant_info', 'Hỏi thông tin nhà hàng'),
        ('ask_promotion', 'Hỏi khuyến mãi'),
        ('feedback', 'Phản hồi, đánh giá'),
        ('other', 'Khác'),
    ]
    
    name = models.CharField(max_length=50, choices=INTENT_TYPES, unique=True)
    description = models.TextField(blank=True)
    training_phrases = models.JSONField(
        default=list,
        help_text="Các mẫu câu ví dụ cho intent này (lưu dạng JSON array)"
    )
    response_templates = models.JSONField(
        default=list,
        help_text="Các mẫu phản hồi cho intent này (lưu dạng JSON array)"
    )
    requires_auth = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.get_name_display()

class ChatEntity(models.Model):
    """Entities that can be extracted from user messages"""
    ENTITY_TYPES = [
        ('food_item', 'Món ăn'),
        ('restaurant', 'Nhà hàng'),
        ('cuisine', 'Loại ẩm thực'),
        ('price_range', 'Khoảng giá'),
        ('quantity', 'Số lượng'),
        ('delivery_time', 'Thời gian giao hàng'),
        ('payment_method', 'Phương thức thanh toán'),
        ('promo_code', 'Mã giảm giá'),
    ]
    
    name = models.CharField(max_length=50, choices=ENTITY_TYPES)
    value = models.CharField(max_length=255)
    synonyms = models.JSONField(
        default=list,
        blank=True,
        help_text="Các từ đồng nghĩa hoặc cách gọi khác (lưu dạng JSON array)"
    )
    
    class Meta:
        verbose_name_plural = "Chat entities"
        
    def __str__(self):
        return f"{self.get_name_display()}: {self.value}"

class FoodView(models.Model):
    user_preference = models.ForeignKey(UserPreference, on_delete=models.CASCADE)
    food = models.ForeignKey(Food, on_delete=models.CASCADE)
    view_count = models.IntegerField(default=1)
    last_viewed = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['user_preference', 'food']


class ChatSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_sessions')
    session_id = models.CharField(max_length=100, unique=True)
    title = models.CharField(max_length=200, default='Cuộc trò chuyện mới')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-updated_at']
    
    def __str__(self):
        return f"Chat {self.session_id} - {self.user.username}"

class ChatMessage(models.Model):
    MESSAGE_TYPES = (
        ('user', 'Người dùng'),
        ('bot', 'Bot'),
        ('system', 'Hệ thống'),
    )
    
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    message_type = models.CharField(max_length=10, choices=MESSAGE_TYPES)
    content = models.TextField(verbose_name='Nội dung')
    
    # Dữ liệu bổ sung (JSON) - có thể chứa food recommendations, etc.
    metadata = models.JSONField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
    
    def __str__(self):
        return f"{self.get_message_type_display()}: {self.content[:50]}"

class AIModel(models.Model):
    name = models.CharField(max_length=100, verbose_name='Tên model')
    model_type = models.CharField(max_length=20, choices=[
        ('recommendation', 'Gợi ý món ăn'),
        ('chatbot', 'Chatbot'),
        ('sentiment', 'Phân tích cảm xúc'),
    ])
    version = models.CharField(max_length=20, verbose_name='Phiên bản')
    is_active = models.BooleanField(default=True)
    
    # Cấu hình model
    config = models.JSONField(default=dict, verbose_name='Cấu hình')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['name', 'version']
    
    def __str__(self):
        return f"{self.name} v{self.version}"
