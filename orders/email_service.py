# orders/email_service.py
from django.core.mail import send_mail, EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


def send_order_confirmation_email(order):
    """
    Gửi email xác nhận đơn hàng cho khách hàng
    Hỗ trợ cả COD và thanh toán online
    """
    try:
        # Lấy email từ order trước (email khách nhập khi đặt hàng), sau đó mới từ user profile
        customer_email = None
        customer_name = "Quý khách"
        
        # Ưu tiên email mà khách hàng nhập khi đặt hàng
        if hasattr(order, 'customer_email') and order.customer_email:
            customer_email = order.customer_email
            customer_name = getattr(order, 'guest_name', None)
            if not customer_name and order.customer:
                customer_name = order.customer.get_full_name() or order.customer.username
            if not customer_name:
                customer_name = "Quý khách"
        # Fallback về email trong profile nếu không có email đặt hàng
        elif order.customer and order.customer.email:
            customer_email = order.customer.email
            customer_name = order.customer.get_full_name() or order.customer.username
        
        if not customer_email:
            logger.warning(f"No email found for order {order.id}")
            return False
        
        # Lấy thông tin đơn hàng
        order_items = order.items.select_related('food').all()
        items_list = []
        for item in order_items:
            items_list.append({
                'name': item.food.name if item.food else 'Món ăn',
                'quantity': item.quantity,
                'price': item.price,
                'total': item.price * item.quantity
            })
        
        # Xác định phương thức thanh toán
        payment_method_display = "Tiền mặt (COD)"
        if hasattr(order, 'payment'):
            pm = order.payment.payment_method
            if pm == 'vnpay':
                payment_method_display = "VNPay"
            elif pm == 'paypal':
                payment_method_display = "PayPal"
            elif pm == 'cash':
                payment_method_display = "Tiền mặt (COD)"
        
        # Context cho email
        context = {
            'customer_name': customer_name,
            'order_number': order.order_number or f"#{order.id}",
            'order_id': order.id,
            'items': items_list,
            'subtotal': order.subtotal,
            'delivery_fee': order.delivery_fee,
            'total_amount': order.total_amount,
            'delivery_address': order.delivery_address,
            'delivery_phone': order.delivery_phone,
            'payment_method': payment_method_display,
            'restaurant_name': order.restaurant.name if order.restaurant else 'Nhà hàng',
            'restaurant_address': order.restaurant.address if order.restaurant else '',
            'notes': order.notes or '',
            'created_at': order.created_at,
            'year': timezone.now().year,
        }
        
        # Subject
        subject = f"Xác nhận đơn hàng #{order.order_number or order.id} - Food Delivery"
        
        # Plain text version
        text_content = f"""
Xin chào {customer_name},

Cảm ơn bạn đã đặt hàng tại Food Delivery!

📋 THÔNG TIN ĐƠN HÀNG
Mã đơn hàng: {context['order_number']}
Ngày đặt: {context['created_at'].strftime('%d/%m/%Y %H:%M')}

🍽️ CHI TIẾT ĐƠN HÀNG
"""
        for item in items_list:
            text_content += f"- {item['name']} x{item['quantity']}: {item['total']:,.0f}đ\n"
        
        text_content += f"""
Tạm tính: {context['subtotal']:,.0f}đ
Phí giao hàng: {context['delivery_fee']:,.0f}đ
TỔNG CỘNG: {context['total_amount']:,.0f}đ

📍 ĐỊA CHỈ GIAO HÀNG
{context['delivery_address']}
SĐT: {context['delivery_phone']}

💳 PHƯƠNG THỨC THANH TOÁN
{context['payment_method']}

🏪 NHÀ HÀNG
{context['restaurant_name']}
{context['restaurant_address']}

Đơn hàng của bạn đang được xử lý. Chúng tôi sẽ thông báo khi đơn hàng được giao.

Trân trọng,
Food Delivery Team
"""
        
        # HTML version
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #fff; }}
        .header {{ background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%); color: white; padding: 30px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 28px; }}
        .header p {{ margin: 10px 0 0; opacity: 0.9; }}
        .content {{ padding: 30px; }}
        .order-info {{ background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 25px; }}
        .order-info h3 {{ color: #FF6B35; margin-top: 0; border-bottom: 2px solid #FF6B35; padding-bottom: 10px; }}
        .order-number {{ font-size: 24px; font-weight: bold; color: #FF6B35; }}
        .items-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        .items-table th {{ background: #FF6B35; color: white; padding: 12px; text-align: left; }}
        .items-table td {{ padding: 12px; border-bottom: 1px solid #eee; }}
        .items-table tr:hover {{ background: #f8f9fa; }}
        .total-row {{ font-weight: bold; background: #fff3e0 !important; }}
        .total-row td {{ border-top: 2px solid #FF6B35; }}
        .info-box {{ background: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }}
        .info-box.success {{ background: #e8f5e9; border-color: #4CAF50; }}
        .info-box.warning {{ background: #fff3e0; border-color: #FF9800; }}
        .footer {{ background: #333; color: #fff; padding: 25px; text-align: center; }}
        .footer a {{ color: #FF6B35; text-decoration: none; }}
        .badge {{ display: inline-block; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }}
        .badge-cod {{ background: #4CAF50; color: white; }}
        .badge-online {{ background: #2196F3; color: white; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🍔 Food Delivery</h1>
            <p>Đơn hàng của bạn đã được xác nhận!</p>
        </div>
        
        <div class="content">
            <p>Xin chào <strong>{context['customer_name']}</strong>,</p>
            <p>Cảm ơn bạn đã đặt hàng! Dưới đây là thông tin chi tiết đơn hàng của bạn:</p>
            
            <div class="order-info">
                <h3>📋 Thông tin đơn hàng</h3>
                <p><strong>Mã đơn hàng:</strong> <span class="order-number">{context['order_number']}</span></p>
                <p><strong>Ngày đặt:</strong> {context['created_at'].strftime('%d/%m/%Y lúc %H:%M')}</p>
                <p><strong>Thanh toán:</strong> <span class="badge {'badge-cod' if 'COD' in context['payment_method'] else 'badge-online'}">{context['payment_method']}</span></p>
            </div>
            
            <h3>🍽️ Chi tiết đơn hàng</h3>
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Món ăn</th>
                        <th style="text-align: center;">SL</th>
                        <th style="text-align: right;">Đơn giá</th>
                        <th style="text-align: right;">Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
"""
        for item in items_list:
            html_content += f"""
                    <tr>
                        <td>{item['name']}</td>
                        <td style="text-align: center;">{item['quantity']}</td>
                        <td style="text-align: right;">{item['price']:,.0f}đ</td>
                        <td style="text-align: right;">{item['total']:,.0f}đ</td>
                    </tr>
"""
        
        html_content += f"""
                    <tr>
                        <td colspan="3" style="text-align: right;">Tạm tính:</td>
                        <td style="text-align: right;">{context['subtotal']:,.0f}đ</td>
                    </tr>
                    <tr>
                        <td colspan="3" style="text-align: right;">Phí giao hàng:</td>
                        <td style="text-align: right;">{context['delivery_fee']:,.0f}đ</td>
                    </tr>
                    <tr class="total-row">
                        <td colspan="3" style="text-align: right; font-size: 18px;">TỔNG CỘNG:</td>
                        <td style="text-align: right; font-size: 18px; color: #FF6B35;">{context['total_amount']:,.0f}đ</td>
                    </tr>
                </tbody>
            </table>
            
            <div class="info-box">
                <h4 style="margin-top: 0;">📍 Địa chỉ giao hàng</h4>
                <p style="margin-bottom: 0;">
                    {context['delivery_address']}<br>
                    <strong>SĐT:</strong> {context['delivery_phone']}
                </p>
            </div>
            
            <div class="info-box success">
                <h4 style="margin-top: 0;">🏪 Nhà hàng</h4>
                <p style="margin-bottom: 0;">
                    <strong>{context['restaurant_name']}</strong><br>
                    {context['restaurant_address']}
                </p>
            </div>
"""
        
        if context['notes']:
            html_content += f"""
            <div class="info-box warning">
                <h4 style="margin-top: 0;">📝 Ghi chú</h4>
                <p style="margin-bottom: 0;">{context['notes']}</p>
            </div>
"""
        
        html_content += f"""
            <p style="text-align: center; margin-top: 30px;">
                <strong>Đơn hàng của bạn đang được xử lý!</strong><br>
                Chúng tôi sẽ thông báo khi đơn hàng được giao.
            </p>
        </div>
        
        <div class="footer">
            <p>© {context['year']} Food Delivery. All rights reserved.</p>
            <p>Nếu có thắc mắc, vui lòng liên hệ: <a href="mailto:support@fooddelivery.com">support@fooddelivery.com</a></p>
        </div>
    </div>
</body>
</html>
"""
        
        # Gửi email
        email = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[customer_email]
        )
        email.attach_alternative(html_content, "text/html")
        email.send(fail_silently=False)
        
        logger.info(f"Order confirmation email sent to {customer_email} for order {order.id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send order confirmation email for order {order.id}: {str(e)}")
        return False


def send_order_status_update_email(order, new_status, message=""):
    """
    Gửi email thông báo cập nhật trạng thái đơn hàng
    """
    try:
        customer_email = None
        customer_name = "Quý khách"
        
        # Ưu tiên email mà khách hàng nhập khi đặt hàng
        if hasattr(order, 'customer_email') and order.customer_email:
            customer_email = order.customer_email
            customer_name = getattr(order, 'guest_name', None)
            if not customer_name and order.customer:
                customer_name = order.customer.get_full_name() or order.customer.username
            if not customer_name:
                customer_name = "Quý khách"
        # Fallback về email trong profile nếu không có email đặt hàng
        elif order.customer and order.customer.email:
            customer_email = order.customer.email
            customer_name = order.customer.get_full_name() or order.customer.username
        
        if not customer_email:
            return False
        
        # Map status to Vietnamese
        status_map = {
            'pending': ('⏳ Chờ xác nhận', 'Đơn hàng đang chờ nhà hàng xác nhận'),
            'confirmed': ('✅ Đã xác nhận', 'Nhà hàng đã xác nhận đơn hàng của bạn'),
            'preparing': ('👨‍🍳 Đang chuẩn bị', 'Nhà hàng đang chuẩn bị món ăn'),
            'ready': ('📦 Sẵn sàng', 'Món ăn đã sẵn sàng, đang tìm shipper'),
            'assigned': ('🚴 Đã có shipper', 'Shipper đã nhận đơn và đang đến lấy hàng'),
            'picked_up': ('📤 Đã lấy hàng', 'Shipper đã lấy hàng từ nhà hàng'),
            'delivering': ('🛵 Đang giao', 'Shipper đang trên đường giao hàng đến bạn'),
            'delivered': ('🎉 Đã giao', 'Đơn hàng đã được giao thành công'),
            'completed': ('✨ Hoàn thành', 'Đơn hàng đã hoàn thành. Cảm ơn bạn!'),
            'cancelled': ('❌ Đã hủy', 'Đơn hàng đã bị hủy'),
        }
        
        status_info = status_map.get(new_status, ('📋 Cập nhật', message or 'Trạng thái đơn hàng đã được cập nhật'))
        
        subject = f"{status_info[0]} - Đơn hàng #{order.order_number or order.id}"
        
        text_content = f"""
Xin chào {customer_name},

{status_info[1]}

Mã đơn hàng: #{order.order_number or order.id}
Trạng thái mới: {status_info[0]}

{message if message else ''}

Trân trọng,
Food Delivery Team
"""
        
        send_mail(
            subject=subject,
            message=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[customer_email],
            fail_silently=True
        )
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to send status update email for order {order.id}: {str(e)}")
        return False
