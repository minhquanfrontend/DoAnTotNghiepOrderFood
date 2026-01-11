# orders/views.py
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes
# from channels.layers import get_channel_layer
# from asgiref.sync import async_to_sync
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import timedelta
from django.db.models import Sum, Count
from django.db.models.functions import TruncHour, TruncDay, TruncMonth
import math
import decimal

from .models import Order, OrderItem, OrderTracking, Cart, CartItem, ShipperLocation
from .serializers import (
    OrderSerializer, OrderItemSerializer, CartSerializer, CartItemSerializer, 
    CreateOrderSerializer, OrderStatusUpdateSerializer, ShipperLocationSerializer, 
    OrderTrackingSerializer, SellerOrderSerializer, ShipperOrderSerializer, 
    CustomerOrderSerializer, get_order_serializer_for_user
)
from .permissions import IsOwnerOrAdmin, IsSellerOfOrder, IsShipperOfOrder
from .email_service import send_order_confirmation_email, send_order_status_update_email
from restaurants.models import Food, Restaurant


def _order_can_be_processed_without_payment(order):
    """Return True if order is allowed to proceed to seller/shipper flow.

    Policy:
    - If there is no Payment record yet -> allow for pending orders (seller confirmation).
    - If payment method is cash -> allow even when payment_status is pending.
    - Otherwise require order.payment_status == 'paid'.
    - Allow processing for orders with status 'pending' (for seller confirmation)
    """
    print(f"_order_can_be_processed_without_payment called for order {order.id}")
    
    order_status = getattr(order, "status", None)
    print(f"Order status: {order_status}")
    
    # Allow processing for pending orders (seller confirmation) - check this FIRST
    if order_status == "pending":
        print("Pending order - allowing processing")
        return True
    
    try:
        payment = order.payment
        print(f"Payment record: {payment}")
    except Exception as e:
        print(f"No payment record found: {e}")
        # If no payment record and not pending, block
        print("No payment record and not pending - blocking")
        return False

    payment_method = getattr(payment, "payment_method", None)
    print(f"Payment method: {payment_method}")
    
    if payment_method == "cash":
        print("Cash payment - allowing processing")
        return True

    payment_status = getattr(order, "payment_status", None)
    print(f"Payment status: {payment_status}")
    
    result = payment_status == "paid"
    print(f"Final result: {result}")
    return result


# ------------------------
# Helpers
# ------------------------
def _get_restaurants_for_user(user):
    """
    Trả về queryset các Restaurant mà user sở hữu.
    Admin (is_staff) -> trả về all()
    Nếu không có restaurant nào thì trả về empty queryset.
    """
    if user.is_staff:
        return Restaurant.objects.all()
    return Restaurant.objects.filter(owner=user)


def _user_is_seller(user):
    # Nếu project dùng user_type, có thể check bằng getattr(user, "user_type", None) == "seller"
    # Mặc định ở đây coi owner trên Restaurant là nguồn quyết định.
    return Restaurant.objects.filter(owner=user).exists()


# ================== HOME API ==================
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def home_data(request):
    """API cho màn hình Home"""
    banners = [
        {"id": 1, "title": "Giảm giá 50% hôm nay", "image": "/media/banners/banner1.jpg"},
        {"id": 2, "title": "Món mới hot", "image": "/media/banners/banner2.jpg"},
    ]

    foods = Food.objects.filter(is_available=True)[:10]
    restaurants = Restaurant.objects.all()[:10]

    return Response({
        "banners": banners,
        "popular_foods": [
            {"id": f.id, "name": f.name, "price": f.price, "image": f.image.url if f.image else None}
            for f in foods
        ],
        "restaurants": [
            {"id": r.id, "name": r.name, "rating": getattr(r, "rating", None), "logo": r.logo.url if r.logo else None}
            for r in restaurants
        ]
    })


# ================== CART ==================
class CartView(generics.RetrieveAPIView):
    serializer_class = CartSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        cart, _ = Cart.objects.get_or_create(user=self.request.user)
        return cart


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def add_to_cart(request):
    # Support multiple field names for food_id
    food_id = request.data.get("food_id") or request.data.get("food")
    print(f"[add_to_cart] Received: food_id={food_id}, data={request.data}")
    
    if not food_id:
        return Response({"error": "food_id is required"}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        quantity = int(request.data.get("quantity") or request.data.get("qty") or 1)
    except (TypeError, ValueError):
        quantity = 1
    notes = request.data.get("notes", "") or ""

    try:
        food = Food.objects.get(id=food_id, is_available=True)
    except Food.DoesNotExist:
        print(f"[add_to_cart] Food not found: {food_id}")
        return Response({"error": f"Food with id {food_id} not found or not available"}, status=status.HTTP_404_NOT_FOUND)
    cart, _ = Cart.objects.get_or_create(user=request.user)

    cart_item, created = CartItem.objects.get_or_create(
        cart=cart,
        food=food,
        defaults={"quantity": quantity, "notes": notes},
    )

    if not created:
        cart_item.quantity += quantity
        cart_item.notes = notes
        cart_item.save()

    return Response({"message": "Đã thêm vào giỏ hàng", "cart": CartSerializer(cart).data})


@api_view(["PUT"])
@permission_classes([permissions.IsAuthenticated])
def update_cart_item(request, item_id):
    cart_item = get_object_or_404(CartItem, id=item_id, cart__user=request.user)
    try:
        quantity = int(request.data.get("quantity", 1))
    except (TypeError, ValueError):
        quantity = cart_item.quantity

    if quantity <= 0:
        cart_item.delete()
        return Response({"message": "Đã xóa khỏi giỏ hàng"})

    cart_item.quantity = quantity
    cart_item.notes = request.data.get("notes", cart_item.notes)
    cart_item.save()

    return Response({"message": "Đã cập nhật giỏ hàng", "cart": CartSerializer(cart_item.cart).data})


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def remove_from_cart(request, item_id):
    cart_item = get_object_or_404(CartItem, id=item_id, cart__user=request.user)
    cart_item.delete()
    return Response({"message": "Đã xóa khỏi giỏ hàng"})


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def clear_cart(request):
    cart = get_object_or_404(Cart, user=request.user)
    cart.items.all().delete()
    return Response({"message": "Đã xóa toàn bộ giỏ hàng"})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def checkout_order(request):
    """
    Checkout đơn hàng - tạo đơn hàng từ giỏ hàng và chuyển đến thanh toán
    """
    return create_order(request)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def cart_checkout(request):
    """
    Checkout giỏ hàng - tạo đơn hàng từ giỏ hàng hiện tại
    """
    return create_order(request)


# ================== HELPERS ==================
def compute_cart_subtotal(cart):
    """
    Tính subtotal từ cart.items trong trường hợp cart.total_amount không tồn tại.
    Trả về Decimal.
    """
    subtotal = decimal.Decimal("0.00")
    for item in cart.items.select_related("food").all():
        if not item.food or not item.food.is_available:
            continue
        price = getattr(item.food, "discount_price", None) or getattr(item.food, "price", 0)
        try:
            price = decimal.Decimal(str(price))
        except (Exception, TypeError, ValueError):
            price = decimal.Decimal("0.00")
        subtotal += price * decimal.Decimal(str(item.quantity))
    return subtotal


# ================== ORDER ==================
@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def create_order(request):
    """
    Tạo order từ Cart của user.
    """
    print(f"[create_order] Received data: {request.data}")
    serializer = CreateOrderSerializer(data=request.data)
    if not serializer.is_valid():
        print(f"[create_order] Validation errors: {serializer.errors}")
        return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    cart = get_object_or_404(Cart, user=request.user)
    if not cart.items.exists():
        return Response({"error": "Giỏ hàng trống"}, status=status.HTTP_400_BAD_REQUEST)

    # Build set of restaurants from cart items, skip items with no food or no restaurant
    restaurants = set()
    missing_restaurant_items = []
    for item in cart.items.select_related("food").all():
        if not item.food:
            missing_restaurant_items.append(f"CartItem id={item.id} missing food")
            continue
        if not getattr(item.food, "restaurant", None):
            missing_restaurant_items.append(f"Food id={item.food.id} ('{item.food.name}') chưa gắn nhà hàng")
            continue
        restaurants.add(item.food.restaurant)

    if missing_restaurant_items:
        return Response({"error": "Một số món chưa được cấu hình đúng", "details": missing_restaurant_items},
                        status=status.HTTP_400_BAD_REQUEST)

    if not restaurants:
        return Response({"error": "Không thể xác định nhà hàng từ giỏ hàng"}, status=status.HTTP_400_BAD_REQUEST)

    if len(restaurants) > 1:
        return Response({"error": "Chỉ được đặt món từ một nhà hàng trong một đơn"}, status=status.HTTP_400_BAD_REQUEST)

    restaurant = list(restaurants)[0]

    # Compute subtotal (use cart.total_amount if exists)
    subtotal = getattr(cart, "total_amount", None)
    if subtotal is None:
        subtotal = compute_cart_subtotal(cart)
    else:
        # Ensure subtotal is a Decimal
        try:
            subtotal = decimal.Decimal(subtotal)
        except Exception:
            subtotal = compute_cart_subtotal(cart)

    # delivery_fee fallback
    delivery_fee = getattr(restaurant, "delivery_fee", 0) or 0
    try:
        delivery_fee = decimal.Decimal(delivery_fee)
    except Exception:
        delivery_fee = decimal.Decimal("0.00")

    total_amount = (decimal.Decimal(subtotal) + delivery_fee)

    # Get pickup coordinates - from request or fallback to restaurant
    pickup_lat = serializer.validated_data.get("pickup_latitude")
    pickup_lng = serializer.validated_data.get("pickup_longitude")
    pickup_addr = serializer.validated_data.get("pickup_address", "") or ""
    pickup_phone = serializer.validated_data.get("pickup_phone", "") or ""
    
    # Fallback to restaurant data if not provided
    if not pickup_lat and restaurant.latitude:
        pickup_lat = restaurant.latitude
    if not pickup_lng and restaurant.longitude:
        pickup_lng = restaurant.longitude
    if not pickup_addr and restaurant.address:
        pickup_addr = restaurant.address
    if not pickup_phone and restaurant.phone:
        pickup_phone = restaurant.phone

    with transaction.atomic():
        try:
            order = Order.objects.create(
                customer=request.user,
                restaurant=restaurant,
                customer_email=serializer.validated_data.get("customer_email", "") or request.user.email or "",
                delivery_address=serializer.validated_data.get("delivery_address", "") or "",
                delivery_phone=serializer.validated_data.get("delivery_phone", "") or "",
                delivery_latitude=serializer.validated_data.get("delivery_latitude"),
                delivery_longitude=serializer.validated_data.get("delivery_longitude"),
                pickup_address=pickup_addr,
                pickup_phone=pickup_phone,
                pickup_latitude=pickup_lat,
                pickup_longitude=pickup_lng,
                notes=serializer.validated_data.get("notes", "") or "",
                subtotal=subtotal,
                delivery_fee=delivery_fee,
                total_amount=total_amount,
                created_at=timezone.now(),
                updated_at=timezone.now(),
                status="pending",
            )
        except Exception as e:
            return Response({"error": "Tạo đơn hàng thất bại", "detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Create OrderItem for each cart item
        for cart_item in cart.items.select_related("food").all():
            food = cart_item.food
            if not food:
                continue
            price = getattr(food, "discount_price", None) or getattr(food, "price", 0)
            try:
                price = decimal.Decimal(price)
            except Exception:
                price = decimal.Decimal("0.00")

            OrderItem.objects.create(
                order=order,
                food=food,
                quantity=cart_item.quantity,
                price=price,
                notes=cart_item.notes or ""
            )

            # Update food stats if field exists
            try:
                if hasattr(food, "total_orders"):
                    food.total_orders = (getattr(food, "total_orders", 0) or 0) + cart_item.quantity
                    food.save(update_fields=["total_orders"])
            except Exception:
                pass

        # Create initial tracking
        try:
            OrderTracking.objects.create(
                order=order,
                status="pending",
                message="Đơn được tạo, chờ nhà hàng xác nhận",
                created_at=timezone.now(),
            )
        except Exception:
            pass

        # Optionally clear cart items after creating order
        try:
            cart.items.all().delete()
        except Exception:
            pass
        
        # Save user delivery info for future orders
        try:
            user = request.user
            delivery_address = serializer.validated_data.get("delivery_address", "")
            delivery_phone = serializer.validated_data.get("delivery_phone", "")
            
            # Update user profile with delivery info if not already set
            if delivery_address and not getattr(user, 'address', None):
                user.address = delivery_address
            if delivery_phone and not getattr(user, 'phone_number', None):
                user.phone_number = delivery_phone
            user.save()
        except Exception as e:
            print(f"[create_order] Could not save user delivery info: {e}")
        
        # Send order confirmation email
        try:
            send_order_confirmation_email(order)
        except Exception as e:
            print(f"[create_order] Could not send confirmation email: {e}")

    return Response({"message": "Đặt hàng thành công", "order": OrderSerializer(order).data},
                    status=status.HTTP_201_CREATED)


# ================== CUSTOMER ==================
class MyOrdersView(generics.ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(customer=self.request.user).order_by("-created_at")


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Customers can only see their own orders
        if getattr(user, "user_type", None) == "customer" or user.is_staff:
            return Order.objects.filter(customer=user)
        # Shippers can only see orders assigned to them
        elif getattr(user, "user_type", None) == "shipper":
            return Order.objects.filter(shipper=user)
        # Others (like restaurant owners) can see orders for their restaurants
        else:
            restaurants = Restaurant.objects.filter(owner=user)
            if restaurants.exists():
                return Order.objects.filter(restaurant__in=restaurants)
            return Order.objects.none()


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def cancel_order(request, order_id):
    """
    Cancel do user (customer) request: only allowed when order in allowed statuses.
    """
    order = get_object_or_404(Order, id=order_id, customer=request.user)
    can_cancel = (
        order.status in ["pending", "confirmed"] or
        (order.status == "ready" and getattr(order, "shipper", None) is None)
    )
    if not can_cancel:
        return Response({"error": "Không thể hủy đơn hàng này"}, status=status.HTTP_400_BAD_REQUEST)

    order.status = "cancelled"
    order.save()
    OrderTracking.objects.create(order=order, status="cancelled", message="Đơn hàng đã được hủy bởi khách hàng")
    return Response({"message": "Đã hủy đơn hàng"})


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def delete_order(request, order_id):
    order = get_object_or_404(Order, id=order_id, customer=request.user)
    if order.status in ["delivered", "cancelled"]:
        order.delete()
        return Response({"message": "Đã xóa đơn hàng"})
    return Response({"error": "Chỉ có thể xóa đơn đã hủy hoặc đã giao"}, status=status.HTTP_400_BAD_REQUEST)


# ================== SELLER ==================
class RestaurantOrdersView(generics.ListAPIView):
    """Danh sách đơn hàng cho seller (chủ nhà hàng)"""
    serializer_class = SellerOrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        # Admin -> thấy tất cả đơn
        if user.is_staff:
            return Order.objects.all().order_by("-created_at")

        # Seller -> chỉ thấy đơn hàng thuộc nhà hàng họ sở hữu
        # Show ALL orders for seller's restaurant (no payment filter - seller needs to see all orders)
        seller_restaurants = Restaurant.objects.filter(owner=user)
        if seller_restaurants.exists():
            return Order.objects.filter(
                restaurant__in=seller_restaurants
            ).order_by('-created_at')

        # Nếu không là seller/admin -> trả rỗng
        return Order.objects.none()


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def restaurant_stats(request):
    """Enhanced restaurant statistics with period support (day/week/month/year)"""
    user = request.user
    restaurant = get_object_or_404(Restaurant, owner=user)
    
    period = request.query_params.get('period', 'day')
    now = timezone.now()
    today = now.date()
    
    # Calculate date range based on period
    if period == 'day':
        start_date = today
        end_date = today + timedelta(days=1)
    elif period == 'week':
        start_date = today - timedelta(days=today.weekday())  # Monday
        end_date = start_date + timedelta(days=7)
    elif period == 'month':
        start_date = today.replace(day=1)
        if today.month == 12:
            end_date = today.replace(year=today.year + 1, month=1, day=1)
        else:
            end_date = today.replace(month=today.month + 1, day=1)
    elif period == 'year':
        start_date = today.replace(month=1, day=1)
        end_date = today.replace(year=today.year + 1, month=1, day=1)
    else:
        start_date = today
        end_date = today + timedelta(days=1)
    
    # Get completed/delivered orders for revenue
    completed_orders = Order.objects.filter(
        restaurant=restaurant,
        created_at__gte=start_date,
        created_at__lt=end_date,
        status__in=['completed', 'delivered']
    )
    
    # Get all orders for the period (for order counts)
    all_period_orders = Order.objects.filter(
        restaurant=restaurant,
        created_at__gte=start_date,
        created_at__lt=end_date
    )
    
    # Basic stats
    total_revenue = completed_orders.aggregate(total=Sum('total_amount'))['total'] or 0
    total_orders = all_period_orders.count()
    completed_count = completed_orders.count()
    cancelled_count = all_period_orders.filter(status='cancelled').count()
    
    # Average order value
    avg_order_value = 0
    if completed_count > 0:
        avg_order_value = total_revenue / completed_count
    
    # Top selling items
    top_selling_items = OrderItem.objects.filter(
        order__in=completed_orders
    ).values('food__name', 'food__id').annotate(
        quantity_sold=Sum('quantity'),
        revenue=Sum('price')
    ).order_by('-quantity_sold')[:10]
    
    # Status counts (all time for this restaurant)
    status_counts = Order.objects.filter(restaurant=restaurant).values('status').annotate(count=Count('id'))
    counts = {item['status']: item['count'] for item in status_counts}
    counts['total'] = sum(counts.values())
    
    # Chart data - revenue by time
    chart_labels = []
    chart_values = []
    
    if period == 'day':
        # Hourly breakdown
        hourly_data = completed_orders.annotate(
            hour=TruncHour('created_at')
        ).values('hour').annotate(
            revenue=Sum('total_amount')
        ).order_by('hour')
        
        for i in range(24):
            chart_labels.append(f"{i}h")
            hour_revenue = next((d['revenue'] for d in hourly_data if d['hour'] and d['hour'].hour == i), 0)
            chart_values.append(float(hour_revenue or 0))
    elif period == 'week':
        # Daily breakdown for week
        days = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
        daily_data = completed_orders.annotate(
            day=TruncDay('created_at')
        ).values('day').annotate(
            revenue=Sum('total_amount')
        ).order_by('day')
        
        for i in range(7):
            day_date = start_date + timedelta(days=i)
            chart_labels.append(days[i])
            day_revenue = next((d['revenue'] for d in daily_data if d['day'] and d['day'].date() == day_date), 0)
            chart_values.append(float(day_revenue or 0))
    elif period == 'month':
        # Daily breakdown for month
        daily_data = completed_orders.annotate(
            day=TruncDay('created_at')
        ).values('day').annotate(
            revenue=Sum('total_amount')
        ).order_by('day')
        
        days_in_month = (end_date - start_date).days
        for i in range(min(days_in_month, 31)):
            day_date = start_date + timedelta(days=i)
            chart_labels.append(str(day_date.day))
            day_revenue = next((d['revenue'] for d in daily_data if d['day'] and d['day'].date() == day_date), 0)
            chart_values.append(float(day_revenue or 0))
    else:  # year
        # Monthly breakdown
        months = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12']
        monthly_data = completed_orders.annotate(
            month=TruncMonth('created_at')
        ).values('month').annotate(
            revenue=Sum('total_amount')
        ).order_by('month')
        
        for i in range(12):
            chart_labels.append(months[i])
            month_revenue = next((d['revenue'] for d in monthly_data if d['month'] and d['month'].month == i + 1), 0)
            chart_values.append(float(month_revenue or 0))
    
    # Comparison with previous period
    if period == 'day':
        prev_start = start_date - timedelta(days=1)
        prev_end = start_date
    elif period == 'week':
        prev_start = start_date - timedelta(days=7)
        prev_end = start_date
    elif period == 'month':
        if start_date.month == 1:
            prev_start = start_date.replace(year=start_date.year - 1, month=12)
        else:
            prev_start = start_date.replace(month=start_date.month - 1)
        prev_end = start_date
    else:
        prev_start = start_date.replace(year=start_date.year - 1)
        prev_end = start_date
    
    prev_orders = Order.objects.filter(
        restaurant=restaurant,
        created_at__gte=prev_start,
        created_at__lt=prev_end,
        status__in=['completed', 'delivered']
    )
    prev_revenue = prev_orders.aggregate(total=Sum('total_amount'))['total'] or 0
    prev_order_count = prev_orders.count()
    
    # Calculate growth percentages
    revenue_growth = 0
    if prev_revenue > 0:
        revenue_growth = ((total_revenue - prev_revenue) / prev_revenue) * 100
    
    order_growth = 0
    if prev_order_count > 0:
        order_growth = ((completed_count - prev_order_count) / prev_order_count) * 100
    
    # Recent orders summary
    recent_orders = Order.objects.filter(
        restaurant=restaurant
    ).order_by('-created_at')[:5].values(
        'id', 'order_number', 'status', 'total_amount', 'created_at',
        'customer__first_name', 'customer__last_name'
    )
    
    return Response({
        'period': period,
        'total_revenue': float(total_revenue),
        'total_orders': total_orders,
        'completed_orders': completed_count,
        'cancelled_orders': cancelled_count,
        'avg_order_value': float(avg_order_value),
        'revenue_growth': round(revenue_growth, 1),
        'order_growth': round(order_growth, 1),
        'top_selling_items': list(top_selling_items),
        'status_counts': counts,
        'chart_data': {
            'labels': chart_labels,
            'values': chart_values
        },
        'recent_orders': list(recent_orders),
        'comparison': {
            'prev_revenue': float(prev_revenue),
            'prev_orders': prev_order_count
        }
    })


# ================== ORDER ACTIONS (SELLER / ADMIN) ==================
@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def update_order_status(request, order_id):
    """
    Cập nhật trạng thái đơn hàng - hỗ trợ cả action-based và status-based
    
    Action-based (recommended):
    - action: 'confirm' | 'start_preparing' | 'mark_ready' | 'cancel'
    
    Status-based (legacy):
    - status: 'confirmed' | 'preparing' | 'ready' | etc.
    
    Flow:
    - Seller: pending → confirmed → preparing → ready
    - Shipper: ready → assigned → picked_up → delivering → delivered
    - Customer: delivered → completed
    """
    user = request.user
    order = get_object_or_404(Order, id=order_id)
    
    # DEBUG: Log the request data
    user_type = getattr(user, 'user_type', None)
    print(f"")
    print(f"=" * 60)
    print(f"[UPDATE-STATUS] Order {order_id}")
    print(f"  request.data = {request.data}")
    print(f"  current status = {order.status}")
    print(f"  User: {user.username}, user_type: {user_type}, is_staff: {user.is_staff}")
    print(f"=" * 60)
    
    # Check if using action-based update
    action = request.data.get('action')
    if action:
        # Action-based update (STRICT flow)
        ACTIONS = {
            'confirm': {'from': 'pending', 'to': 'confirmed', 'message': 'Nhà hàng đã nhận đơn hàng'},
            'start_preparing': {'from': 'confirmed', 'to': 'preparing', 'message': 'Nhà hàng đang chuẩn bị món ăn'},
            'mark_ready': {'from': 'preparing', 'to': 'ready', 'message': 'Món ăn đã sẵn sàng, đang tìm shipper'},
            'accept': {'from': 'ready', 'to': 'assigned', 'message': 'Shipper đã nhận đơn'},
            'pick_up': {'from': 'assigned', 'to': 'picked_up', 'message': 'Shipper đã lấy hàng'},
            'start_delivering': {'from': 'picked_up', 'to': 'delivering', 'message': 'Shipper đang giao hàng'},
            'deliver': {'from': 'delivering', 'to': 'delivered', 'message': 'Đã giao hàng cho khách'},
            'complete': {'from': 'delivered', 'to': 'completed', 'message': 'Đơn hàng hoàn thành'},
            # Cancellation actions by role
            'cancel_by_user': {'from': ['pending', 'confirmed'], 'to': 'cancelled_by_user', 'message': 'Khách hàng đã hủy đơn'},
            'cancel_by_seller': {'from': ['pending', 'confirmed', 'preparing'], 'to': 'cancelled_by_seller', 'message': 'Nhà hàng đã hủy đơn'},
            'cancel_by_shipper': {'from': ['assigned', 'picked_up'], 'to': 'cancelled_by_shipper', 'message': 'Shipper đã hủy đơn'},
            'fail_delivery': {'from': ['delivering'], 'to': 'failed_delivery', 'message': 'Giao hàng thất bại'},
        }
        
        if action not in ACTIONS:
            print(f"[UPDATE-STATUS] ❌ Invalid action: {action}. Valid actions: {list(ACTIONS.keys())}")
            return Response({
                'success': False,
                'error': f'Hành động không hợp lệ. Các hành động: {", ".join(ACTIONS.keys())}'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        action_config = ACTIONS[action]
        
        # Check current status - handle both single status and list of statuses
        allowed_from = action_config['from']
        if isinstance(allowed_from, list):
            if order.status not in allowed_from:
                print(f"[UPDATE-STATUS] ❌ Status mismatch: current='{order.status}', required={allowed_from}, action='{action}'")
                return Response({
                    'success': False,
                    'error': f'Không thể thực hiện "{action}" ở trạng thái "{order.get_status_display()}". Trạng thái hiện tại: {order.status}'
                }, status=status.HTTP_400_BAD_REQUEST)
        else:
            if order.status != allowed_from:
                print(f"[UPDATE-STATUS] ❌ Status mismatch: current='{order.status}', required='{allowed_from}', action='{action}'")
                return Response({
                    'success': False,
                    'error': f'Không thể thực hiện "{action}" khi đơn đang ở trạng thái "{order.status}". '
                             f'Đơn phải ở trạng thái "{allowed_from}"'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check permissions
        user_type = getattr(user, 'user_type', None)
        if not user.is_staff:
            if action in ['confirm', 'start_preparing', 'mark_ready', 'cancel_by_seller']:
                # Seller actions
                seller_restaurants = Restaurant.objects.filter(owner=user)
                if not seller_restaurants.exists() or order.restaurant not in seller_restaurants:
                    return Response({'success': False, 'error': 'Bạn không có quyền'}, status=status.HTTP_403_FORBIDDEN)
            elif action in ['accept', 'pick_up', 'start_delivering', 'deliver', 'cancel_by_shipper', 'fail_delivery']:
                # Shipper actions
                if user_type != 'shipper':
                    return Response({'success': False, 'error': 'Chỉ shipper mới có thể thực hiện'}, status=status.HTTP_403_FORBIDDEN)
                if action != 'accept' and order.shipper != user:
                    return Response({'success': False, 'error': 'Đơn này không phải của bạn'}, status=status.HTTP_403_FORBIDDEN)
            elif action in ['complete', 'cancel_by_user']:
                # Customer actions
                if order.customer != user and not user.is_staff:
                    return Response({'success': False, 'error': 'Chỉ khách hàng mới có thể thực hiện'}, status=status.HTTP_403_FORBIDDEN)
        
        # Update order
        old_status = order.status
        order.status = action_config['to']
        
        # Assign shipper if accepting
        if action == 'accept' and user_type == 'shipper':
            order.shipper = user
        
        order.save()
        
        print(f"[UPDATE-STATUS] ✅ SUCCESS: {old_status} -> {action_config['to']} (action: {action})")
        
        # Create tracking
        OrderTracking.objects.create(
            order=order,
            status=action_config['to'],
            message=action_config['message'],
            created_at=timezone.now()
        )
        
        # Send email notification for important status changes
        try:
            if action_config['to'] in ['delivered', 'completed']:
                send_order_status_update_email(order, action_config['to'], action_config['message'])
                print(f"[UPDATE-STATUS] Email sent for status: {action_config['to']}")
        except Exception as e:
            print(f"[UPDATE-STATUS] Could not send status email: {e}")
        
        # Use role-specific serializer for response
        SerializerClass = get_order_serializer_for_user(user)
        return Response({
            'success': True,
            'message': action_config['message'],
            'order': SerializerClass(order).data,
            'transition': {'from': old_status, 'to': action_config['to'], 'action': action}
        })
    
    # Legacy status-based update
    # Check payment processing (only for seller operations)
    if not user.is_staff and getattr(user, 'user_type', None) != 'shipper':
        can_process = _order_can_be_processed_without_payment(order)
        if not can_process:
            return Response(
                {"error": "Đơn hàng chưa thanh toán. Vui lòng chờ khách thanh toán hoặc hủy đơn."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # Check permissions
    if not user.is_staff:
        if getattr(user, 'user_type', None) == 'shipper':
            if order.status not in ['ready', 'assigned', 'picked_up', 'delivering'] or (order.shipper and order.shipper != user):
                return Response(
                    {"error": "Bạn không có quyền cập nhật trạng thái đơn hàng này"}, 
                    status=status.HTTP_403_FORBIDDEN
                )
        else:
            seller_restaurants = Restaurant.objects.filter(owner=user)
            if not seller_restaurants.exists() or order.restaurant not in seller_restaurants:
                return Response(
                    {"error": "Bạn không có quyền cập nhật trạng thái đơn hàng này"}, 
                    status=status.HTTP_403_FORBIDDEN
                )

    # Use the serializer for validation
    serializer = OrderStatusUpdateSerializer(
        data=request.data, 
        user=user, 
        order=order
    )
    
    if not serializer.is_valid():
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
    
    # Update order status
    new_status = serializer.validated_data['status']
    message = serializer.validated_data.get('message', '')
    
    # Assign shipper if this is a shipper accepting an order
    if serializer.validated_data.get('assign_shipper'):
        order.shipper = user
    
    old_status = order.status
    order.status = new_status
    order.save()

    OrderTracking.objects.create(
        order=order,
        status=new_status,
        message=message or f"Đơn hàng đã chuyển sang trạng thái: {order.get_status_display()}",
        created_at=timezone.now()
    )

    if new_status == "delivered":
        try:
            cart = Cart.objects.get(user=order.customer)
            cart.items.all().delete()
        except Cart.DoesNotExist:
            pass

    # Use role-specific serializer for response
    SerializerClass = get_order_serializer_for_user(user)
    return Response({
        'success': True,
        'message': 'Cập nhật trạng thái thành công',
        'order': SerializerClass(order).data,
        'transition': {'from': old_status, 'to': new_status}
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def confirm_order(request, order_id):
    """Seller xác nhận đơn hàng - chuyển từ pending sang confirmed"""
    return _seller_change_status_helper(request, order_id, from_status="pending", to_status="confirmed",
                                        track_message="Nhà hàng đã xác nhận đơn hàng, đang chuẩn bị món ăn")


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def start_preparing(request, order_id):
    """Seller bắt đầu chuẩn bị món ăn - chuyển từ confirmed sang preparing"""
    return _seller_change_status_helper(request, order_id, from_status="confirmed", to_status="preparing",
                                        track_message="Nhà hàng đang chuẩn bị món ăn")


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def mark_ready(request, order_id):
    """Seller marks food ready - transitions from 'preparing' to 'ready'"""
    return _seller_change_status_helper(request, order_id, from_status="preparing", to_status="ready",
                                        track_message="Món ăn đã sẵn sàng, đang tìm tài xế giao hàng")

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def find_shipper(request, order_id):
    """Seller requests a shipper - transitions from 'preparing' to 'ready'"""
    return _seller_change_status_helper(request, order_id, from_status="preparing", to_status="ready",
                                        track_message="Nhà hàng đã chuẩn bị xong và đang tìm tài xế.")


def _seller_change_status_helper(request, order_id, from_status, to_status, track_message=""):
    user = request.user
    order = get_object_or_404(Order, id=order_id)

    if not _order_can_be_processed_without_payment(order):
        return Response(
            {"error": "Đơn hàng chưa thanh toán. Vui lòng chờ khách thanh toán hoặc hủy đơn."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Quyền: admin hoặc owner của nhà hàng
    if not user.is_staff:
        seller_restaurants = Restaurant.objects.filter(owner=user)
        if not seller_restaurants.exists() or order.restaurant not in seller_restaurants:
            return Response({"error": "Bạn không có quyền cập nhật trạng thái của đơn hàng này"}, status=status.HTTP_403_FORBIDDEN)

    # Kiểm tra trạng thái hiện tại
    if getattr(order, "status", None) != from_status:
        return Response({"error": f"Đơn hàng phải ở trạng thái '{from_status}' để chuyển sang '{to_status}'."},
                        status=status.HTTP_400_BAD_REQUEST)

    order.status = to_status
    order.save()

    OrderTracking.objects.create(
        order=order,
        status=to_status,
        message=track_message,
        created_at=timezone.now()
    )

    # Use role-specific serializer for response
    SerializerClass = get_order_serializer_for_user(request.user)
    return Response({"message": f"Đã chuyển đơn sang '{to_status}'", "order": SerializerClass(order).data})


# ================== SHIPPER ==================
class AvailableOrdersView(generics.ListAPIView):
    serializer_class = ShipperOrderSerializer  # Shipper sees both addresses
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        user_type = getattr(user, "user_type", None)

        print(f"AvailableOrdersView: user {user.username} has user_type {user_type}, is_staff: {user.is_staff}")

        # Only shippers should see available orders
        if user_type != "shipper" and not user.is_staff:
            print(f"Access denied for user {user.username}: not a shipper")
            return Order.objects.none()

        # Orders are available for shipper ONLY when status is 'ready' (seller finished preparing)
        # Include both paid orders and COD orders (payment__payment_method='cod')
        qs = Order.objects.filter(
            status="ready",
            shipper__isnull=True,
        ).filter(
            Q(payment_status="paid") | Q(payment__payment_method="cod") | Q(payment__isnull=True)
        ).order_by('-created_at')
        print(f"Found {qs.count()} available orders with status 'ready' and no shipper")

        try:
            lat = float(self.request.query_params.get("lat")) if self.request.query_params.get("lat") else None
            lng = float(self.request.query_params.get("lng")) if self.request.query_params.get("lng") else None
            radius_km = float(self.request.query_params.get("radius_km", 3))
        except ValueError:
            lat = lng = None
            radius_km = 3.0

        if lat and lng:
            lat_delta = radius_km / 111.0
            lng_delta = radius_km / (111.0 * max(0.1, math.cos(math.radians(lat))))
            qs = qs.filter(
                delivery_latitude__isnull=False,
                delivery_longitude__isnull=False,
                delivery_latitude__gte=lat - lat_delta,
                delivery_latitude__lte=lat + lat_delta,
                delivery_longitude__gte=lng - lng_delta,
                delivery_longitude__lte=lng + lng_delta,
            )
            print(f"After location filtering: {qs.count()} orders in radius {radius_km}km around {lat}, {lng}")

        return qs


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def accept_order(request, order_id):
    """
    Shipper nhận đơn: chỉ shipper (hoặc admin) mới được accept.
    Order phải ở trạng thái 'ready' và chưa có shipper.
    """
    print(f"accept_order called by user {request.user.username} (type: {getattr(request.user, 'user_type', 'None')}) for order {order_id}")

    if getattr(request.user, "user_type", None) != "shipper" and not request.user.is_staff:
        print(f"Access denied: user type is {getattr(request.user, 'user_type', 'None')}")
        return Response({"error": "Chỉ shipper mới có thể nhận đơn"}, status=status.HTTP_403_FORBIDDEN)

    try:
        # Allow orders with status 'ready' or 'finding_shipper', no shipper assigned yet
        # Remove payment__isnull=False requirement to support guest/COD orders
        order = Order.objects.filter(
            id=order_id,
            status__in=["ready", "finding_shipper"],
            shipper__isnull=True,
        ).first()
        
        if not order:
            print(f"Order {order_id} not found or not available for pickup")
            return Response({"error": "Đơn hàng không tồn tại hoặc không thể nhận"}, status=status.HTTP_404_NOT_FOUND)

        # For COD orders or guest orders without payment record, allow processing
        # Only block if payment exists and is not paid (and not COD)
        try:
            payment = order.payment
            if payment and payment.payment_method != "cash" and order.payment_status != "paid":
                return Response(
                    {"error": "Đơn hàng chưa thanh toán nên không thể nhận."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except Exception:
            # No payment record - this is OK for guest/COD orders
            pass
            
        print(f"Found order {order_id} with status {order.status}, shipper: {order.shipper}")
    except Exception as e:
        print(f"Error finding order {order_id}: {e}")
        return Response({"error": "Đơn hàng không tồn tại hoặc không thể nhận"}, status=status.HTTP_404_NOT_FOUND)

    order.shipper = request.user
    order.status = "assigned"
    order.save()
    print(f"Order {order_id} assigned to {request.user.username}, new status: {order.status}")

    OrderTracking.objects.create(
        order=order,
        status="assigned",
        message=f"Đơn hàng đã được giao cho shipper {request.user.get_full_name() or request.user.username}",
        created_at=timezone.now()
    )

    return Response({"message": "Đã nhận đơn hàng", "order": ShipperOrderSerializer(order).data})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def mark_picked_up(request, order_id):
    """Shipper đánh dấu đã lấy hàng từ nhà hàng - chuyển từ ready/picked_up sang picked_up"""
    if getattr(request.user, "user_type", None) != "shipper" and not request.user.is_staff:
        return Response({"error": "Chỉ shipper mới có thể cập nhật trạng thái này"}, status=status.HTTP_403_FORBIDDEN)

    order = get_object_or_404(Order, id=order_id, shipper=request.user)
    if not _order_can_be_processed_without_payment(order):
        return Response(
            {"error": "Đơn hàng chưa thanh toán. Không thể cập nhật trạng thái giao hàng."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # accept both ready->picked_up or picked_up->picked_up (idempotent)
    if order.status not in ["ready", "picked_up"]:
        return Response({"error": "Đơn không ở trạng thái phù hợp để đánh dấu đã lấy"}, status=status.HTTP_400_BAD_REQUEST)

    order.status = "picked_up"
    order.save()

    OrderTracking.objects.create(
        order=order,
        status="picked_up",
        message=f"Shipper {request.user.get_full_name() or request.user.username} đã lấy hàng",
        created_at=timezone.now()
    )

    return Response({"message": "Đã lấy hàng thành công", "order": ShipperOrderSerializer(order).data})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def start_delivering(request, order_id):
    """Shipper bắt đầu giao hàng - chuyển từ picked_up sang delivering"""
    if getattr(request.user, "user_type", None) != "shipper" and not request.user.is_staff:
        return Response({"error": "Chỉ shipper mới có thể cập nhật trạng thái này"}, status=status.HTTP_403_FORBIDDEN)

    order = get_object_or_404(Order, id=order_id, shipper=request.user)
    if not _order_can_be_processed_without_payment(order):
        return Response(
            {"error": "Đơn hàng chưa thanh toán. Không thể cập nhật trạng thái giao hàng."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if order.status != "picked_up":
        return Response({"error": "Đơn phải ở trạng thái 'picked_up' để bắt đầu giao"}, status=status.HTTP_400_BAD_REQUEST)

    order.status = "delivering"
    order.save()

    OrderTracking.objects.create(
        order=order,
        status="delivering",
        message="Shipper đang giao hàng đến khách hàng",
        created_at=timezone.now()
    )

    return Response({"message": "Đã bắt đầu giao hàng", "order": ShipperOrderSerializer(order).data})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def mark_delivered(request, order_id):
    """Shipper đánh dấu đã giao thành công - chuyển từ delivering sang delivered"""
    if getattr(request.user, "user_type", None) != "shipper" and not request.user.is_staff:
        return Response({"error": "Chỉ shipper mới có thể cập nhật trạng thái này"}, status=status.HTTP_403_FORBIDDEN)

    order = get_object_or_404(Order, id=order_id, shipper=request.user)
    if not _order_can_be_processed_without_payment(order):
        return Response(
            {"error": "Đơn hàng chưa thanh toán. Không thể cập nhật trạng thái giao hàng."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if order.status != "delivering":
        return Response({"error": "Đơn phải ở trạng thái 'delivering' để đánh dấu đã giao"}, status=status.HTTP_400_BAD_REQUEST)

    order.status = "delivered"
    order.delivered_at = timezone.now()
    order.save()

    OrderTracking.objects.create(
        order=order,
        status="delivered",
        message="Shipper đã giao thành công",
        created_at=timezone.now()
    )

    # Send email notification for delivery completion
    try:
        send_order_status_update_email(order, "delivered", "Shipper đã giao thành công")
        print(f"[MARK_DELIVERED] Email sent for order {order.id}")
    except Exception as e:
        print(f"[MARK_DELIVERED] Could not send delivery email: {e}")

    if getattr(order, "customer", None):
        try:
            cart = Cart.objects.get(user=order.customer)
            cart.items.all().delete()
        except Cart.DoesNotExist:
            pass

    return Response({"message": "Đã giao hàng thành công", "order": ShipperOrderSerializer(order).data})

class UpdateShipperLocationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        if not hasattr(user, 'user_type') or user.user_type != 'shipper':
            return Response({'error': 'Chỉ shipper mới có thể cập nhật vị trí.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = ShipperLocationSerializer(data=request.data)
        if serializer.is_valid():
            latitude = serializer.validated_data['latitude']
            longitude = serializer.validated_data['longitude']
            order_id = serializer.validated_data['order'].id

            # Update or create shipper location
            ShipperLocation.objects.update_or_create(
                shipper=user,
                defaults={'latitude': latitude, 'longitude': longitude, 'order_id': order_id}
            )

            # Broadcast location to the order tracking group
            # TODO: Re-enable WebSocket when channels is installed
            # channel_layer = get_channel_layer()
            # async_to_sync(channel_layer.group_send)(
            #     f'track_{order_id}',
            #     {
            #         'type': 'location_update',
            #         'location': {
            #             'latitude': latitude,
            #             'longitude': longitude,
            #         }
            #     }
            # )

            return Response({'status': 'location updated'}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ================== MAP & LOCATION APIs ==================
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def order_map_data(request, order_id):
    """
    Lấy thông tin địa chỉ cho bản đồ shipper:
    - Địa chỉ nhà hàng (pickup location)
    - Địa chỉ khách hàng (delivery location)
    - Trạng thái đơn hàng để quyết định hiển thị route nào
    """
    order = get_object_or_404(Order, id=order_id)

    # Kiểm tra quyền: chỉ shipper của đơn hàng hoặc admin
    if not request.user.is_staff and order.shipper != request.user:
        return Response({"error": "Bạn không có quyền xem thông tin bản đồ của đơn hàng này"},
                       status=status.HTTP_403_FORBIDDEN)

    data = {
        "order_id": order.id,
        "status": order.status,
        "restaurant": {
            "name": order.restaurant.name,
            "address": order.pickup_address or order.restaurant.address or "Chưa có địa chỉ",
            "phone": order.pickup_phone or order.restaurant.phone or "",
            "latitude": order.pickup_latitude,
            "longitude": order.pickup_longitude,
        },
        "customer": {
            "name": f"{order.customer.first_name} {order.customer.last_name}".strip() or order.customer.username,
            "address": order.delivery_address,
            "phone": order.delivery_phone,
            "latitude": order.delivery_latitude,
            "longitude": order.delivery_longitude,
        }
    }

    return Response(data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def update_restaurant_address(request, order_id):
    """
    Cập nhật địa chỉ nhà hàng nếu thiếu thông tin địa lý
    Chỉ dành cho seller (chủ nhà hàng) hoặc admin
    """
    order = get_object_or_404(Order, id=order_id)
    user = request.user

    # Kiểm tra quyền: chỉ owner của nhà hàng hoặc admin
    if not user.is_staff:
        seller_restaurants = Restaurant.objects.filter(owner=user)
        if not seller_restaurants.exists() or order.restaurant not in seller_restaurants:
            return Response({"error": "Bạn không có quyền cập nhật địa chỉ nhà hàng này"},
                           status=status.HTTP_403_FORBIDDEN)

    address = request.data.get("address", "").strip()
    phone = request.data.get("phone", "").strip()
    latitude = request.data.get("latitude")
    longitude = request.data.get("longitude")

    if not address:
        return Response({"error": "Địa chỉ không được để trống"}, status=status.HTTP_400_BAD_REQUEST)

    # Cập nhật thông tin nhà hàng
    restaurant = order.restaurant
    restaurant.address = address
    restaurant.phone = phone or restaurant.phone
    if latitude and longitude:
        restaurant.latitude = latitude
        restaurant.longitude = longitude
    restaurant.save()

    # Cập nhật thông tin pickup của đơn hàng
    order.pickup_address = address
    order.pickup_phone = phone or order.pickup_phone
    if latitude and longitude:
        order.pickup_latitude = latitude
        order.pickup_longitude = longitude
    order.save()

    # Tạo tracking record
    OrderTracking.objects.create(
        order=order,
        status=order.status,
        message=f"Đã cập nhật địa chỉ nhà hàng: {address}",
        created_at=timezone.now()
    )

    return Response({
        "message": "Đã cập nhật địa chỉ nhà hàng thành công",
        "restaurant": {
            "name": restaurant.name,
            "address": restaurant.address,
            "phone": restaurant.phone,
            "latitude": restaurant.latitude,
            "longitude": restaurant.longitude,
        }
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def shipper_route_info(request, order_id):
    """
    Thông tin route cho shipper dựa trên trạng thái đơn hàng:
    - Nếu status = "ready": chỉ hiển thị đường đi tới nhà hàng
    - Nếu status = "picked_up": hiển thị đường đi từ nhà hàng tới khách hàng
    - Nếu status = "delivering": hiển thị đường đi tới khách hàng
    """
    order = get_object_or_404(Order, id=order_id)

    # Kiểm tra quyền: chỉ shipper của đơn hàng hoặc admin
    if not request.user.is_staff and order.shipper != request.user:
        return Response({"error": "Bạn không có quyền xem thông tin route của đơn hàng này"},
                       status=status.HTTP_403_FORBIDDEN)

    # Determine current step based on status
    # pickup: shipper needs to go to restaurant (assigned)
    # delivery: shipper needs to go to customer (picked_up, delivering)
    if order.status in ["ready", "assigned"]:
        current_step = "pickup"
    else:
        current_step = "delivery"
    
    # Get restaurant coordinates - try from order first, then from restaurant
    pickup_lat = order.pickup_latitude
    pickup_lng = order.pickup_longitude
    if not pickup_lat or not pickup_lng:
        if order.restaurant:
            pickup_lat = order.restaurant.latitude
            pickup_lng = order.restaurant.longitude
    
    route_info = {
        "order_id": order.id,
        "status": order.status,
        "current_step": current_step,
        "pickup_location": {
            "name": order.restaurant.name if order.restaurant else "Nhà hàng",
            "address": order.pickup_address or (order.restaurant.address if order.restaurant else "Chưa có địa chỉ"),
            "phone": order.pickup_phone or (order.restaurant.phone if order.restaurant else ""),
            "latitude": float(pickup_lat) if pickup_lat else None,
            "longitude": float(pickup_lng) if pickup_lng else None,
            "is_ready": bool(pickup_lat and pickup_lng),
        },
        "delivery_location": {
            "name": f"{order.customer.first_name} {order.customer.last_name}".strip() or order.customer.username if order.customer else "Khách hàng",
            "address": order.delivery_address,
            "phone": order.delivery_phone,
            "latitude": float(order.delivery_latitude) if order.delivery_latitude else None,
            "longitude": float(order.delivery_longitude) if order.delivery_longitude else None,
            "is_ready": bool(order.delivery_latitude and order.delivery_longitude),
        }
    }
    return Response(route_info)


class MyDeliveryOrdersView(generics.ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self.request.user, "user_type", None) != "shipper":
            return Order.objects.none()
        # Show orders assigned to this shipper that are not yet delivered
        return Order.objects.filter(
            shipper=self.request.user,
            status__in=['assigned', 'picked_up', 'delivering']
        ).filter(
            Q(payment_status="paid") | Q(payment__payment_method="cash")
        ).order_by('-created_at')


# ================== GUEST ORDER API ==================
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def create_guest_order(request):
    """
    Tạo đơn hàng cho khách không đăng nhập (Guest Checkout) - Giống Shopee Food
    Yêu cầu: name, phone, email, address, items
    Trả về: order_number để khách theo dõi + gửi email xác nhận
    """
    from django.core.mail import send_mail
    from django.conf import settings
    import uuid
    import re
    
    data = request.data
    
    # Validate required fields
    guest_name = data.get('guest_name', '').strip()
    guest_phone = data.get('guest_phone', '').strip()
    guest_email = data.get('guest_email', '').strip()
    delivery_address = data.get('delivery_address', '').strip()
    items = data.get('items', [])
    
    errors = {}
    if not guest_name:
        errors['guest_name'] = 'Vui lòng nhập họ tên'
    if not guest_phone:
        errors['guest_phone'] = 'Vui lòng nhập số điện thoại'
    elif not re.match(r'^(0|\+84)[0-9]{9,10}$', guest_phone.replace(' ', '')):
        errors['guest_phone'] = 'Số điện thoại không hợp lệ'
    if not guest_email:
        errors['guest_email'] = 'Vui lòng nhập email để nhận mã đơn hàng'
    elif not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', guest_email):
        errors['guest_email'] = 'Email không hợp lệ'
    if not delivery_address:
        errors['delivery_address'] = 'Vui lòng nhập địa chỉ giao hàng'
    if not items or len(items) == 0:
        errors['items'] = 'Giỏ hàng trống'
    
    if errors:
        return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
    
    # Get or create guest user
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    # Create unique guest username based on email
    guest_username = f"guest_{guest_email.split('@')[0]}_{uuid.uuid4().hex[:6]}"
    
    try:
        # Try to find existing guest user by email
        guest_user = User.objects.filter(email=guest_email, username__startswith='guest_').first()
        if guest_user:
            # Update name if guest user already exists (user may use different name each time)
            guest_user.first_name = guest_name.split()[0] if guest_name else 'Khách'
            guest_user.last_name = ' '.join(guest_name.split()[1:]) if len(guest_name.split()) > 1 else ''
            guest_user.save()
        else:
            guest_user = User.objects.create_user(
                username=guest_username,
                email=guest_email,
                first_name=guest_name.split()[0] if guest_name else 'Khách',
                last_name=' '.join(guest_name.split()[1:]) if len(guest_name.split()) > 1 else '',
                password=uuid.uuid4().hex,  # Random password
            )
            # Mark as guest user
            if hasattr(guest_user, 'user_type'):
                guest_user.user_type = 'customer'
                guest_user.save()
    except Exception as e:
        return Response({'error': f'Không thể tạo tài khoản khách: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    # Process items and determine restaurant
    restaurants = set()
    order_items_data = []
    subtotal = decimal.Decimal('0.00')
    
    for item in items:
        food_id = item.get('food_id') or item.get('food')
        quantity = int(item.get('quantity', 1))
        notes = item.get('notes', '')
        
        try:
            food = Food.objects.get(id=food_id, is_available=True)
            restaurants.add(food.restaurant)
            price = food.discount_price if food.discount_price else food.price
            subtotal += decimal.Decimal(str(price)) * quantity
            order_items_data.append({
                'food': food,
                'quantity': quantity,
                'price': price,
                'notes': notes
            })
        except Food.DoesNotExist:
            return Response({'error': f'Món ăn ID {food_id} không tồn tại hoặc đã hết'}, status=status.HTTP_400_BAD_REQUEST)
    
    if len(restaurants) > 1:
        return Response({'error': 'Chỉ được đặt món từ một nhà hàng trong một đơn'}, status=status.HTTP_400_BAD_REQUEST)
    
    if not restaurants:
        return Response({'error': 'Không tìm thấy nhà hàng'}, status=status.HTTP_400_BAD_REQUEST)
    
    restaurant = list(restaurants)[0]
    delivery_fee = decimal.Decimal(str(getattr(restaurant, 'delivery_fee', 0) or 0))
    total_amount = subtotal + delivery_fee
    
    # Create order
    with transaction.atomic():
        order = Order.objects.create(
            customer=guest_user,
            customer_email=guest_email,
            guest_name=guest_name,  # Store guest name directly in order
            restaurant=restaurant,
            delivery_address=delivery_address,
            delivery_phone=guest_phone,
            delivery_latitude=data.get('delivery_latitude'),
            delivery_longitude=data.get('delivery_longitude'),
            notes=data.get('notes', '') or f'Khách: {guest_name} - {guest_email}',
            subtotal=subtotal,
            delivery_fee=delivery_fee,
            total_amount=total_amount,
            status='pending',
        )
        
        # Create order items
        for item_data in order_items_data:
            OrderItem.objects.create(
                order=order,
                food=item_data['food'],
                quantity=item_data['quantity'],
                price=item_data['price'],
                notes=item_data['notes']
            )
        
        # Create tracking
        OrderTracking.objects.create(
            order=order,
            status='pending',
            message=f'Đơn hàng được tạo bởi khách {guest_name}',
        )
    
    # Send confirmation email
    try:
        email_subject = f'🍔 Xác nhận đơn hàng #{order.order_number} - Food Delivery'
        email_body = f'''
Xin chào {guest_name},

Cảm ơn bạn đã đặt hàng tại Food Delivery!

📋 THÔNG TIN ĐƠN HÀNG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mã đơn hàng: {order.order_number}
Nhà hàng: {restaurant.name}
Địa chỉ giao: {delivery_address}
Số điện thoại: {guest_phone}

🛒 CHI TIẾT ĐƠN HÀNG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'''
        for item_data in order_items_data:
            email_body += f"• {item_data['food'].name} x{item_data['quantity']} - {int(item_data['price'] * item_data['quantity']):,}đ\n"
        
        email_body += f'''
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tạm tính: {int(subtotal):,}đ
Phí giao hàng: {int(delivery_fee):,}đ
💰 TỔNG CỘNG: {int(total_amount):,}đ

📱 THEO DÕI ĐƠN HÀNG
Sử dụng mã đơn hàng: {order.order_number}
để theo dõi trạng thái đơn hàng của bạn.

Trân trọng,
Food Delivery Team
'''
        
        send_mail(
            subject=email_subject,
            message=email_body,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@fooddelivery.com'),
            recipient_list=[guest_email],
            fail_silently=True,
        )
    except Exception as e:
        print(f"Failed to send email: {e}")
    
    return Response({
        'message': 'Đặt hàng thành công! Mã đơn hàng đã được gửi đến email của bạn.',
        'order': {
            'id': order.id,
            'order_number': order.order_number,
            'status': order.status,
            'total_amount': float(total_amount),
            'delivery_address': delivery_address,
            'restaurant_name': restaurant.name,
            'guest_email': guest_email,
        }
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def track_guest_order(request):
    """
    Theo dõi đơn hàng bằng mã đơn hàng (cho khách không đăng nhập)
    Query params: order_number, email (optional for verification)
    """
    order_number = request.query_params.get('order_number', '').strip()
    email = request.query_params.get('email', '').strip()
    
    if not order_number:
        return Response({'error': 'Vui lòng nhập mã đơn hàng'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        order = Order.objects.get(order_number=order_number)
    except Order.DoesNotExist:
        return Response({'error': 'Không tìm thấy đơn hàng với mã này'}, status=status.HTTP_404_NOT_FOUND)
    
    # Optional email verification - check both customer email and customer_email field
    if email:
        order_email = order.customer_email or (order.customer.email if order.customer else None)
        if order_email and order_email.lower() != email.lower():
            return Response({'error': 'Email không khớp với đơn hàng'}, status=status.HTTP_403_FORBIDDEN)
    
    # Get tracking history
    tracking = order.tracking.all().order_by('created_at')
    tracking_data = [
        {
            'status': t.status,
            'message': t.message,
            'created_at': t.created_at.isoformat(),
        }
        for t in tracking
    ]
    
    # Get order items
    items_data = [
        {
            'food_name': item.food.name,
            'quantity': item.quantity,
            'price': float(item.price),
            'total': float(item.price * item.quantity),
        }
        for item in order.items.all()
    ]
    
    # Check if order can be confirmed by guest
    can_confirm_delivery = order.status == 'delivered'
    
    return Response({
        'order': {
            'id': order.id,
            'order_number': order.order_number,
            'status': order.status,
            'status_display': order.get_status_display(),
            'restaurant_name': order.restaurant.name,
            'delivery_address': order.delivery_address,
            'delivery_phone': order.delivery_phone,
            'subtotal': float(order.subtotal),
            'delivery_fee': float(order.delivery_fee),
            'total_amount': float(order.total_amount),
            'created_at': order.created_at.isoformat(),
            'items': items_data,
            'tracking': tracking_data,
            'shipper_name': f"{order.shipper.first_name} {order.shipper.last_name}".strip() if order.shipper else None,
            'shipper_phone': getattr(order.shipper, 'phone_number', None) if order.shipper else None,
            'can_confirm_delivery': can_confirm_delivery,
        }
    })


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def guest_confirm_delivery(request):
    """
    Guest xác nhận đã nhận được hàng
    Yêu cầu: order_number, email (để xác thực)
    """
    data = request.data
    order_number = data.get('order_number', '').strip()
    email = data.get('email', '').strip()
    
    if not order_number:
        return Response({'error': 'Vui lòng nhập mã đơn hàng'}, status=status.HTTP_400_BAD_REQUEST)
    
    if not email:
        return Response({'error': 'Vui lòng nhập email để xác thực'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        order = Order.objects.get(order_number=order_number)
    except Order.DoesNotExist:
        return Response({'error': 'Không tìm thấy đơn hàng với mã này'}, status=status.HTTP_404_NOT_FOUND)
    
    # Verify email matches order
    order_email = order.customer_email or (order.customer.email if order.customer else None)
    if not order_email or order_email.lower() != email.lower():
        return Response({'error': 'Email không khớp với đơn hàng'}, status=status.HTTP_403_FORBIDDEN)
    
    # Check if order is in 'delivered' status
    if order.status != 'delivered':
        if order.status == 'completed':
            return Response({'error': 'Đơn hàng đã được xác nhận hoàn thành trước đó'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'error': f'Không thể xác nhận. Đơn hàng đang ở trạng thái: {order.get_status_display()}'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Update order status to completed
    order.status = 'completed'
    order.payment_status = 'paid'  # Mark as paid (COD collected)
    order.save()
    
    # Create tracking record
    OrderTracking.objects.create(
        order=order,
        status='completed',
        message='Khách hàng đã xác nhận nhận hàng thành công',
    )
    
    return Response({
        'success': True,
        'message': 'Cảm ơn bạn đã xác nhận nhận hàng!',
        'order': {
            'id': order.id,
            'order_number': order.order_number,
            'status': order.status,
            'status_display': order.get_status_display(),
        }
    })


# ================== EXTRA APIS ==================
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_orders_by_status(request, status_code):
    """Lọc đơn hàng của user theo trạng thái"""
    orders = Order.objects.filter(customer=request.user, status=status_code).order_by('-created_at')
    # Use role-specific serializer
    SerializerClass = get_order_serializer_for_user(request.user)
    serializer = SerializerClass(orders, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def order_tracking(request, order_id):
    """
    Xem thông tin tracking đầy đủ của đơn hàng - bao gồm:
    - Trạng thái hiện tại
    - Lịch sử trạng thái
    - Vị trí shipper real-time (nếu có)
    - Thông tin shipper
    - Địa chỉ giao hàng
    """
    order = get_object_or_404(Order, id=order_id)
    
    # Check permission: customer, shipper of order, or admin
    user = request.user
    if not user.is_staff and order.customer != user and order.shipper != user:
        return Response({"error": "Bạn không có quyền xem đơn hàng này"}, status=status.HTTP_403_FORBIDDEN)
    
    # Get tracking history
    tracking_history = order.tracking.all().order_by("created_at")
    
    # Get shipper location if order is being delivered
    shipper_location = None
    if order.shipper and order.status in ['assigned', 'picked_up', 'delivering']:
        try:
            loc = ShipperLocation.objects.filter(shipper=order.shipper).order_by('-id').first()
            if loc:
                shipper_location = {
                    'latitude': float(loc.latitude),
                    'longitude': float(loc.longitude),
                }
        except Exception:
            pass
    
    # Status display mapping
    status_display_map = {
        'pending': 'Chờ xác nhận',
        'confirmed': 'Đã xác nhận',
        'preparing': 'Đang chuẩn bị',
        'ready': 'Sẵn sàng giao',
        'assigned': 'Shipper đã nhận đơn',
        'picked_up': 'Đã lấy hàng',
        'delivering': 'Đang giao hàng',
        'delivered': 'Đã giao hàng',
        'completed': 'Hoàn thành',
        'cancelled_by_user': 'Khách hủy',
        'cancelled_by_seller': 'Nhà hàng hủy',
        'cancelled_by_shipper': 'Shipper hủy',
    }
    
    response_data = {
        'order_id': order.id,
        'order_number': order.order_number,
        'status': order.status,
        'status_display': status_display_map.get(order.status, order.status),
        
        # Shipper info
        'shipper_info': {
            'id': order.shipper.id if order.shipper else None,
            'first_name': order.shipper.first_name if order.shipper else None,
            'last_name': order.shipper.last_name if order.shipper else None,
            'phone': getattr(order.shipper, 'phone_number', None) if order.shipper else None,
            'phone_number': getattr(order.shipper, 'phone_number', None) if order.shipper else None,
        } if order.shipper else None,
        
        # Current shipper location (real-time)
        'current_location': shipper_location,
        
        # Delivery location (customer address)
        'delivery_location': {
            'address': order.delivery_address,
            'lat': float(order.delivery_latitude) if order.delivery_latitude else None,
            'lng': float(order.delivery_longitude) if order.delivery_longitude else None,
        },
        
        # Pickup location (restaurant)
        'pickup_location': {
            'address': order.pickup_address or (order.restaurant.address if order.restaurant else None),
            'lat': float(order.pickup_latitude) if order.pickup_latitude else None,
            'lng': float(order.pickup_longitude) if order.pickup_longitude else None,
            'restaurant_name': order.restaurant.name if order.restaurant else None,
        },
        
        # Timestamps
        'actual_pickup_time': order.picked_at.isoformat() if hasattr(order, 'picked_at') and order.picked_at else None,
        'actual_delivery_time': order.delivered_at.isoformat() if hasattr(order, 'delivered_at') and order.delivered_at else None,
        'estimated_arrival': None,  # Can be calculated based on distance
        
        # Route points for map (empty for now, can be populated with actual route)
        'route_points': [],
        'distance_traveled': 0,
        
        # Notes
        'notes': order.notes or '',
        
        # Tracking history
        'tracking_history': [
            {
                'status': t.status,
                'message': t.message,
                'created_at': t.created_at.isoformat(),
            }
            for t in tracking_history
        ],
    }
    
    return Response(response_data)
