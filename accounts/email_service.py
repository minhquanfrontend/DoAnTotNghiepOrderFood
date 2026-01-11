from django.conf import settings
from django.core.mail import EmailMultiAlternatives
import logging

logger = logging.getLogger(__name__)


def send_verification_email(user, verification_token):
    try:
        if not user.email:
            return False

        verification_url = f"http://localhost:3000/verify-email?token={verification_token}"
        subject = "Xác thực tài khoản Food Delivery"

        text_content = (
            f"Xin chào {user.get_full_name() or user.username},\n\n"
            f"Vui lòng xác thực email bằng cách mở liên kết sau:\n{verification_url}\n\n"
            "Liên kết này sẽ hết hạn sau 24 giờ.\n\n"
            "Trân trọng,\nFood Delivery"
        )

        html_content = f"""
<!DOCTYPE html>
<html>
<head><meta charset=\"utf-8\" /></head>
<body style=\"font-family: Arial, sans-serif;\">
  <h2>Food Delivery - Xác thực tài khoản</h2>
  <p>Xin chào <b>{user.get_full_name() or user.username}</b>,</p>
  <p>Vui lòng xác thực email bằng cách bấm nút bên dưới:</p>
  <p><a href=\"{verification_url}\" style=\"display:inline-block;padding:12px 18px;background:#FF6B35;color:#fff;text-decoration:none;border-radius:6px;\">Xác thực Email</a></p>
  <p>Nếu nút không hoạt động, hãy copy link này:</p>
  <p style=\"word-break:break-all;\">{verification_url}</p>
  <p>Liên kết hết hạn sau 24 giờ.</p>
</body>
</html>
"""

        email = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None) or settings.EMAIL_HOST_USER,
            to=[user.email],
        )
        email.attach_alternative(html_content, "text/html")
        email.send(fail_silently=False)
        return True

    except Exception as e:
        logger.exception("send_verification_email failed: %s", e)
        return False


def send_welcome_email(user):
    try:
        if not user.email:
            return False

        subject = "Chào mừng bạn đến với Food Delivery!"
        text_content = (
            f"Xin chào {user.get_full_name() or user.username},\n\n"
            "Tài khoản của bạn đã được xác thực thành công.\n\n"
            "Trân trọng,\nFood Delivery"
        )

        email = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None) or settings.EMAIL_HOST_USER,
            to=[user.email],
        )
        email.send(fail_silently=False)
        return True

    except Exception as e:
        logger.exception("send_welcome_email failed: %s", e)
        return False
