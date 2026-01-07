from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class Notification(models.Model):
    NOTIFICATION_TYPES = (
        ('order_created', 'Đơn hàng mới'),
        ('order_confirmed', 'Đơn hàng đã xác nhận'),
        ('order_preparing', 'Đang chuẩn bị'),
        ('order_ready', 'Sẵn sàng giao'),
        ('order_picked_up', 'Đã lấy hàng'),
        ('order_delivering', 'Đang giao'),
        ('order_delivered', 'Đã giao'),
        ('order_cancelled', 'Đơn hàng bị hủy'),
        ('payment_success', 'Thanh toán thành công'),
        ('payment_failed', 'Thanh toán thất bại'),
        ('new_review', 'Đánh giá mới'),
        ('promotion', 'Khuyến mãi'),
        ('system', 'Thông báo hệ thống'),
    )
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=200, verbose_name='Tiêu đề')
    message = models.TextField(verbose_name='Nội dung')
    
    # Dữ liệu bổ sung (JSON)
    data = models.JSONField(blank=True, null=True)
    
    # Trạng thái
    is_read = models.BooleanField(default=False)
    is_sent = models.BooleanField(default=False)
    
    # Thời gian
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(blank=True, null=True)
    
    class Meta:
        verbose_name = 'Thông báo'
        verbose_name_plural = 'Thông báo'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.user.username} - {self.title}"

class PushToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_tokens')
    token = models.CharField(max_length=500, unique=True)
    device_type = models.CharField(max_length=20, choices=[('ios', 'iOS'), ('android', 'Android')])
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Push Token'
        verbose_name_plural = 'Push Tokens'
    
    def __str__(self):
        return f"{self.user.username} - {self.device_type}"

class NotificationTemplate(models.Model):
    notification_type = models.CharField(max_length=20, choices=Notification.NOTIFICATION_TYPES, unique=True)
    title_template = models.CharField(max_length=200, verbose_name='Mẫu tiêu đề')
    message_template = models.TextField(verbose_name='Mẫu nội dung')
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name = 'Mẫu thông báo'
        verbose_name_plural = 'Mẫu thông báo'
    
    def __str__(self):
        return f"{self.get_notification_type_display()}"
    
    def render(self, context=None):
        """Render template với context data"""
        if not context:
            context = {}
        
        title = self.title_template
        message = self.message_template
        
        for key, value in context.items():
            placeholder = f"{{{key}}}"
            title = title.replace(placeholder, str(value))
            message = message.replace(placeholder, str(value))
        
        return title, message
