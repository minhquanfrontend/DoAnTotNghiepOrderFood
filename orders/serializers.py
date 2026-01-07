from rest_framework import serializers
from .models import Order, OrderItem, OrderTracking, Cart, CartItem, ShipperLocation
from restaurants.serializers import FoodSerializer
from django.contrib.auth import get_user_model

User = get_user_model()

class OrderItemSerializer(serializers.ModelSerializer):
    food_name = serializers.CharField(source='food.name', read_only=True)
    food_image = serializers.ImageField(source='food.image', read_only=True)
    total_price = serializers.ReadOnlyField()
    
    class Meta:
        model = OrderItem
        fields = '__all__'
        read_only_fields = ('order',)

class OrderTrackingSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderTracking
        fields = '__all__'
        read_only_fields = ('order',)

class OrderSerializer(serializers.ModelSerializer):
    """Base OrderSerializer - returns all fields (for admin)"""
    items = OrderItemSerializer(many=True, read_only=True)
    tracking = OrderTrackingSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source='customer.get_full_name', read_only=True)
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    shipper_name = serializers.CharField(source='shipper.get_full_name', read_only=True)
    shipper_phone = serializers.CharField(source='shipper.phone_number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_action_required = serializers.SerializerMethodField()
    payment_action_message = serializers.SerializerMethodField()
    
    class Meta:
        model = Order
        fields = '__all__'
        read_only_fields = ('customer', 'order_number', 'created_at', 'updated_at')

    def get_payment_action_required(self, obj):
        try:
            payment = obj.payment
        except Exception:
            payment = None

        if getattr(obj, 'payment_status', None) == 'paid':
            return False

        if payment is None:
            return getattr(obj, 'payment_status', None) == 'pending'

        if getattr(payment, 'payment_method', None) == 'cash':
            return False

        return getattr(obj, 'payment_status', None) == 'pending'

    def get_payment_action_message(self, obj):
        if not self.get_payment_action_required(obj):
            return ""

        order_number = getattr(obj, 'order_number', str(getattr(obj, 'id', '')))
        return f"Bạn chưa thanh toán đơn {order_number}. Vui lòng thanh toán hoặc hủy đơn."


class SellerOrderSerializer(serializers.ModelSerializer):
    """
    Seller Order Serializer - sees both pickup and delivery info
    Seller needs delivery info to prepare orders correctly
    """
    items = OrderItemSerializer(many=True, read_only=True)
    tracking = OrderTrackingSerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    def get_customer_name(self, obj):
        """Get customer name - handle guest orders"""
        # First priority: guest_name field (for guest orders)
        if obj.guest_name:
            return obj.guest_name
        # Second priority: customer full name
        if obj.customer:
            full_name = obj.customer.get_full_name()
            if full_name and full_name.strip():
                return full_name
            return obj.customer.username
        # Fallback: try to get name from notes
        if obj.notes and 'Khách:' in obj.notes:
            try:
                return obj.notes.split('Khách:')[1].split('-')[0].strip()
            except:
                pass
        return 'Khách vãng lai'
    
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'status', 'status_display', 'payment_status',
            'customer_name', 'restaurant', 'restaurant_name',
            # Seller sees pickup info (their restaurant)
            'pickup_address', 'pickup_phone', 'pickup_latitude', 'pickup_longitude',
            # Seller also needs delivery info to know where order goes
            'delivery_address', 'delivery_phone', 'delivery_latitude', 'delivery_longitude',
            # Price info
            'subtotal', 'delivery_fee', 'discount_amount', 'total_amount',
            # Order details
            'items', 'tracking', 'notes',
            # Timestamps
            'created_at', 'updated_at', 'estimated_delivery_time',
        ]
        read_only_fields = fields


class ShipperOrderSerializer(serializers.ModelSerializer):
    """
    Shipper Order Serializer - sees BOTH pickup_address AND delivery_address
    Shipper needs both to pick up from restaurant and deliver to customer
    """
    items = OrderItemSerializer(many=True, read_only=True)
    tracking = OrderTrackingSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source='customer.get_full_name', read_only=True)
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'status', 'status_display', 'payment_status',
            'customer_name', 'restaurant', 'restaurant_name',
            # Shipper sees BOTH addresses
            'pickup_address', 'pickup_phone', 'pickup_latitude', 'pickup_longitude',
            'delivery_address', 'delivery_phone', 'delivery_latitude', 'delivery_longitude',
            # Price info (for COD collection)
            'subtotal', 'delivery_fee', 'discount_amount', 'total_amount',
            # Order details
            'items', 'tracking', 'notes',
            # Timestamps
            'created_at', 'updated_at', 'estimated_delivery_time', 'delivered_at',
        ]
        read_only_fields = fields


class CustomerOrderSerializer(serializers.ModelSerializer):
    """
    Customer Order Serializer - ONLY sees delivery_address (their own address)
    Customer does NOT need to see restaurant's pickup_address details
    """
    items = OrderItemSerializer(many=True, read_only=True)
    tracking = OrderTrackingSerializer(many=True, read_only=True)
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)
    restaurant_address = serializers.CharField(source='restaurant.address', read_only=True)
    shipper_name = serializers.CharField(source='shipper.get_full_name', read_only=True)
    shipper_phone = serializers.CharField(source='shipper.phone_number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_action_required = serializers.SerializerMethodField()
    payment_action_message = serializers.SerializerMethodField()
    
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'status', 'status_display', 'payment_status',
            'restaurant', 'restaurant_name', 'restaurant_address',
            'shipper', 'shipper_name', 'shipper_phone',
            # Customer sees delivery info (their address)
            'delivery_address', 'delivery_phone', 'delivery_latitude', 'delivery_longitude',
            # Price info
            'subtotal', 'delivery_fee', 'discount_amount', 'total_amount',
            # Order details
            'items', 'tracking', 'notes',
            # Payment
            'payment_action_required', 'payment_action_message',
            # Timestamps
            'created_at', 'updated_at', 'estimated_delivery_time', 'delivered_at',
        ]
        read_only_fields = fields

    def get_payment_action_required(self, obj):
        try:
            payment = obj.payment
        except Exception:
            payment = None
        if getattr(obj, 'payment_status', None) == 'paid':
            return False
        if payment is None:
            return getattr(obj, 'payment_status', None) == 'pending'
        if getattr(payment, 'payment_method', None) == 'cash':
            return False
        return getattr(obj, 'payment_status', None) == 'pending'

    def get_payment_action_message(self, obj):
        if not self.get_payment_action_required(obj):
            return ""
        order_number = getattr(obj, 'order_number', str(getattr(obj, 'id', '')))
        return f"Bạn chưa thanh toán đơn {order_number}. Vui lòng thanh toán hoặc hủy đơn."


def get_order_serializer_for_user(user):
    """
    Helper function to get the appropriate serializer based on user role
    
    Rules:
    - Seller ONLY sees pickup_address
    - Shipper sees BOTH pickup_address and delivery_address
    - Customer sees delivery_address
    - Admin sees all
    """
    if user.is_staff:
        return OrderSerializer
    
    user_type = getattr(user, 'user_type', None)
    
    if user_type == 'seller' or user_type == 'restaurant':
        return SellerOrderSerializer
    elif user_type == 'shipper':
        return ShipperOrderSerializer
    else:
        return CustomerOrderSerializer

class CartItemSerializer(serializers.ModelSerializer):
    food = FoodSerializer(read_only=True)
    food_id = serializers.IntegerField(write_only=True)
    total_price = serializers.ReadOnlyField()
    
    class Meta:
        model = CartItem
        fields = '__all__'
        read_only_fields = ('cart',)

class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_amount = serializers.ReadOnlyField()
    total_items = serializers.ReadOnlyField()
    
    class Meta:
        model = Cart
        fields = '__all__'
        read_only_fields = ('user',)

class CreateOrderSerializer(serializers.Serializer):
    delivery_address = serializers.CharField(required=True, allow_blank=False)
    delivery_phone = serializers.CharField(required=True, allow_blank=False)
    delivery_latitude = serializers.DecimalField(max_digits=10, decimal_places=8, required=False, allow_null=True)
    delivery_longitude = serializers.DecimalField(max_digits=11, decimal_places=8, required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True, default="")
    payment_method = serializers.CharField(required=True, allow_blank=False)

    # Pickup fields (optional, will be auto-populated from restaurant)
    pickup_address = serializers.CharField(required=False, allow_blank=True, allow_null=True, default="")
    pickup_phone = serializers.CharField(required=False, allow_blank=True, allow_null=True, default="")
    pickup_latitude = serializers.DecimalField(max_digits=10, decimal_places=8, required=False, allow_null=True)
    pickup_longitude = serializers.DecimalField(max_digits=11, decimal_places=8, required=False, allow_null=True)
    
    # Extra fields from frontend (ignored but accepted to prevent validation errors)
    items = serializers.ListField(required=False, allow_empty=True, allow_null=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    delivery_fee = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)


class ShipperLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShipperLocation
        fields = ['latitude', 'longitude', 'order']

class OrderStatusUpdateSerializer(serializers.Serializer):
    """
    Serializer for updating order status with STRICT role-based validation
    
    SHOPEE FOOD FLOW:
    - Customer: unpaid → pending (after payment)
    - Seller: pending → confirmed → preparing → ready
    - Shipper: ready → assigned → picked_up → delivering → delivered
    - System: delivered → completed (after COD payment confirmed)
    
    KHÔNG ĐƯỢC NHẢY CÓC TRẠNG THÁI!
    """
    status = serializers.ChoiceField(choices=Order.STATUS_CHOICES)
    message = serializers.CharField(required=False, allow_blank=True)
    
    def __init__(self, *args, **kwargs):
        self.user = kwargs.pop('user', None)
        self.order = kwargs.pop('order', None)
        super().__init__(*args, **kwargs)
    
    def validate_status(self, value):
        """Validate status transition - STRICT, NO SKIPPING STEPS"""
        if not self.user or not self.order:
            raise serializers.ValidationError("User and order context required")
        
        current_status = self.order.status
        user_type = getattr(self.user, 'user_type', None)
        
        # STRICT TRANSITIONS - Shopee Food style (NO SKIPPING!)
        # Seller can ONLY do these transitions:
        SELLER_TRANSITIONS = {
            'pending': ['confirmed'],           # Step 1: Nhận đơn
            'confirmed': ['preparing'],         # Step 2: Bắt đầu chuẩn bị
            'preparing': ['ready'],             # Step 3: Món đã xong
            # Seller CANNOT skip to completed!
        }
        
        # Shipper can ONLY do these transitions:
        SHIPPER_TRANSITIONS = {
            'ready': ['assigned'],              # Step 4: Shipper nhận đơn
            'assigned': ['picked_up'],          # Step 5: Đã lấy hàng
            'picked_up': ['delivering'],        # Step 6: Bắt đầu giao
            'delivering': ['delivered'],        # Step 7: Đã giao hàng
        }
        
        # Customer can confirm delivery (for COD)
        CUSTOMER_TRANSITIONS = {
            'delivered': ['completed'],         # Step 8: Xác nhận đã nhận hàng
        }
        
        # Admin has full control but still follows logical flow
        ADMIN_TRANSITIONS = {
            'unpaid': ['pending', 'cancelled'],
            'pending': ['confirmed', 'cancelled'],
            'confirmed': ['preparing', 'cancelled'],
            'preparing': ['ready', 'cancelled'],
            'ready': ['assigned', 'cancelled'],
            'assigned': ['picked_up', 'cancelled'],
            'picked_up': ['delivering', 'cancelled'],
            'delivering': ['delivered', 'cancelled'],
            'delivered': ['completed', 'cancelled'],
        }
        
        # Choose transition rules based on user role
        if self.user.is_staff:
            valid_transitions = ADMIN_TRANSITIONS
        elif user_type == 'shipper':
            valid_transitions = SHIPPER_TRANSITIONS
        elif user_type in ['seller', 'restaurant']:
            valid_transitions = SELLER_TRANSITIONS
        else:
            # Customer
            valid_transitions = CUSTOMER_TRANSITIONS
        
        # Check if current status allows any transition for this role
        if current_status not in valid_transitions:
            role_name = 'Admin' if self.user.is_staff else user_type or 'Customer'
            raise serializers.ValidationError(
                f"{role_name} không thể cập nhật đơn hàng ở trạng thái '{current_status}'. "
                f"Vui lòng chờ bước tiếp theo trong quy trình."
            )
        
        # Check if the requested transition is valid
        if value not in valid_transitions[current_status]:
            valid_next = valid_transitions[current_status]
            raise serializers.ValidationError(
                f"Không thể chuyển từ '{current_status}' sang '{value}'. "
                f"Bước tiếp theo phải là: {', '.join(valid_next)}"
            )
        
        # Additional validation for shipper accepting orders
        if user_type == 'shipper' and value == 'assigned':
            if self.order.shipper and self.order.shipper != self.user:
                raise serializers.ValidationError("Đơn hàng này đã được giao cho shipper khác")
        
        return value
    
    def validate(self, attrs):
        """Additional cross-field validation"""
        status = attrs.get('status')
        user_type = getattr(self.user, 'user_type', None)
        
        # For shipper accepting orders (ready → assigned), assign the shipper
        if user_type == 'shipper' and status == 'assigned':
            if self.order.status == 'ready':
                attrs['assign_shipper'] = True
        
        return attrs
