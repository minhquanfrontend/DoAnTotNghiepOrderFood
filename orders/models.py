from django.db import models
from django.contrib.auth import get_user_model
from restaurants.models import Restaurant, Food
from django.utils import timezone
from django.conf import settings

User = get_user_model()

class Order(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Chờ xác nhận'),
        ('confirmed', 'Đã xác nhận'),
        ('preparing', 'Đang chuẩn bị'),
        ('ready', 'Sẵn sàng giao'),
        ('assigned', 'Đã giao cho shipper'),
        ('picked_up', 'Shipper đã lấy hàng'),
        ('delivering', 'Đang giao'),
        ('delivered', 'Đã giao'),
        ('completed', 'Hoàn thành'),
        ('cancelled_by_user', 'Khách hủy'),
        ('cancelled_by_seller', 'Nhà hàng hủy'),
        ('cancelled_by_shipper', 'Shipper hủy'),
        ('failed_delivery', 'Giao thất bại'),
    )
    
    PAYMENT_STATUS_CHOICES = (
        ('pending', 'Chờ thanh toán'),
        ('paid', 'Đã thanh toán'),
        ('failed', 'Thanh toán thất bại'),
        ('refunded', 'Đã hoàn tiền'),
    )
    
    # Thông tin cơ bản
    customer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders', null=True, blank=True)
    customer_email = models.EmailField(blank=True, null=True, verbose_name='Email khách hàng')
    guest_name = models.CharField(max_length=255, blank=True, null=True, verbose_name='Tên khách (guest)')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='orders')
    shipper = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='delivery_orders')
    
    # Mã đơn hàng
    order_number = models.CharField(max_length=20, unique=True)
    
    # Trạng thái
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')
    
    # Thông tin giao hàng
    delivery_address = models.TextField(verbose_name='Địa chỉ giao hàng')
    delivery_phone = models.CharField(max_length=20, verbose_name='SĐT nhận hàng')
    delivery_latitude = models.DecimalField(max_digits=10, decimal_places=8, blank=True, null=True)
    delivery_longitude = models.DecimalField(max_digits=11, decimal_places=8, blank=True, null=True)
    
    # Thông tin lấy hàng (pickup from restaurant)
    pickup_address = models.TextField(verbose_name='Địa chỉ lấy hàng', blank=True)
    pickup_phone = models.CharField(max_length=20, verbose_name='SĐT lấy hàng', blank=True)
    pickup_latitude = models.DecimalField(max_digits=10, decimal_places=8, blank=True, null=True)
    pickup_longitude = models.DecimalField(max_digits=11, decimal_places=8, blank=True, null=True)
    
    # Thông tin giá
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='Tổng tiền món ăn')
    delivery_fee = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='Phí giao hàng')
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name='Giảm giá')
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='Tổng tiền')
    
    # Ghi chú
    notes = models.TextField(blank=True, verbose_name='Ghi chú')
    
    # Thời gian
    estimated_delivery_time = models.DateTimeField(blank=True, null=True)
    delivered_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Đơn hàng'
        verbose_name_plural = 'Đơn hàng'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Đơn hàng #{self.order_number}"
        
    @property
    def total(self):
        """
        Calculate total order amount from order items
        This is a read-only property that sums up (price * quantity) of all order items
        """
        return sum(item.price * item.quantity for item in self.items.all())
    
    def save(self, *args, **kwargs):
        if not self.order_number:
            import uuid
            self.order_number = f"FD{uuid.uuid4().hex[:8].upper()}"

        # Auto-populate pickup information from restaurant if not set
        if self.restaurant and (not self.pickup_address or not self.pickup_phone):
            if not self.pickup_address and self.restaurant.address:
                self.pickup_address = self.restaurant.address
            if not self.pickup_phone and self.restaurant.phone:
                self.pickup_phone = self.restaurant.phone
            if not self.pickup_latitude and self.restaurant.latitude:
                self.pickup_latitude = self.restaurant.latitude
            if not self.pickup_longitude and self.restaurant.longitude:
                self.pickup_longitude = self.restaurant.longitude

        super().save(*args, **kwargs)

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    food = models.ForeignKey(Food, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='Giá tại thời điểm đặt')
    notes = models.TextField(blank=True, verbose_name='Ghi chú món ăn')
    
    class Meta:
        verbose_name = 'Món ăn trong đơn hàng'
        verbose_name_plural = 'Món ăn trong đơn hàng'
    
    def __str__(self):
        return f"{self.food.name} x{self.quantity}"
    
    @property
    def total_price(self):
        return (self.price or 0) * self.quantity

class OrderTracking(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='tracking')
    status = models.CharField(max_length=20, choices=Order.STATUS_CHOICES)
    message = models.TextField(verbose_name='Thông điệp')
    latitude = models.DecimalField(max_digits=10, decimal_places=8, blank=True, null=True)
    longitude = models.DecimalField(max_digits=11, decimal_places=8, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Theo dõi đơn hàng'
        verbose_name_plural = 'Theo dõi đơn hàng'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.order.order_number} - {self.get_status_display()}"

class ShipperLocation(models.Model):
    shipper = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='location')
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='shipper_locations', null=True, blank=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    timestamp = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Location for {self.shipper.username} at {self.timestamp}"

class Cart(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='cart')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Giỏ hàng của {self.user.username}"
    
    @property
    def total_amount(self):
        return sum(item.total_price for item in self.items.all())
    
    @property
    def total_items(self):
        return sum(item.quantity for item in self.items.all())

class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    food = models.ForeignKey(Food, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    notes = models.TextField(blank=True, verbose_name='Ghi chú')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['cart', 'food']
    
    def __str__(self):
        return f"{self.food.name} x{self.quantity}"
    
    @property
    def total_price(self):
        price = self.food.discount_price if self.food.discount_price else self.food.price
        return (price or 0) * self.quantity
