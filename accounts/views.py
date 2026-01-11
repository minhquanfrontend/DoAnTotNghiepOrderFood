from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from .models import User, UserRequest
from .email_service import send_verification_email, send_welcome_email
from .serializers import (
    UserRegistrationSerializer,
    UserLoginSerializer,
    UserProfileSerializer,
    UserRequestSerializer,
    ShipperLocationSerializer,
)

# -------------------- Helper --------------------
def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }

# -------------------- Đăng ký --------------------
class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        tokens = get_tokens_for_user(user)

        email_sent = False
        try:
            verification_token = user.generate_verification_token()
            email_sent = send_verification_email(user, verification_token)
        except Exception as e:
            print(f"Could not send verification email: {e}")

        return Response({
            "message": "Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.",
            "user": UserProfileSerializer(user).data,
            "tokens": tokens,
            "email_sent": email_sent,
        }, status=status.HTTP_201_CREATED)

# -------------------- Đăng nhập --------------------
class LoginView(generics.GenericAPIView):
    serializer_class = UserLoginSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        tokens = get_tokens_for_user(user)

        return Response({
            "message": "Đăng nhập thành công",
            "user": UserProfileSerializer(user).data,
            "tokens": tokens,
        }, status=status.HTTP_200_OK)

# -------------------- Hồ sơ cá nhân --------------------
class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user
    
    def perform_update(self, serializer):
        # debug log incoming validated data
        try:
            data = serializer.validated_data
        except Exception:
            data = {}
        print('ProfileView.perform_update - validated_data:', data)
        
        # Check if email is being changed
        old_email = self.request.user.email
        new_email = data.get('email')
        email_changed = new_email and old_email != new_email
        
        if email_changed:
            print(f'Email change detected: {old_email} -> {new_email}')
            # Send verification email to OLD email address before updating
            try:
                from .email_service import send_verification_email
                # Generate new verification token but don't save it yet
                import uuid
                from django.utils import timezone
                
                verification_token = uuid.uuid4()
                # Send to OLD email with message about email change
                from django.core.mail import EmailMultiAlternatives
                from django.conf import settings
                
                subject = "Xác nhận thay đổi email - Food Delivery"
                text_content = f"""
Xin chào {self.request.user.get_full_name() or self.request.user.username},

Bạn đã yêu cầu thay đổi email từ {old_email} sang {new_email}.

Để xác nhận thay đổi này, vui lòng bấm vào liên kết sau:
http://localhost:3000/verify-email-change?token={verification_token}

Nếu bạn không thực hiện thay đổi này, vui lòng bỏ qua email này.

Trân trọng,
Food Delivery Team
"""
                
                email = EmailMultiAlternatives(
                    subject=subject,
                    body=text_content,
                    from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None) or settings.EMAIL_HOST_USER,
                    to=[old_email],  # Send to OLD email
                )
                email.send(fail_silently=False)
                print(f'Email change verification sent to OLD email: {old_email}')
                
            except Exception as e:
                print(f'Could not send email change verification: {e}')
        
        user = serializer.save()
        # log saved fields for debugging vietnamese characters
        print('ProfileView.perform_update - saved first_name:', user.first_name)
        print('ProfileView.perform_update - saved last_name:', user.last_name)

# -------------------- Đăng xuất --------------------
class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if not refresh_token:
                return Response({"message": "Đăng xuất thành công"}, status=status.HTTP_200_OK)

            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"message": "Đăng xuất thành công"}, status=status.HTTP_200_OK)

        except TokenError:
            return Response({"message": "Đăng xuất thành công"}, status=status.HTTP_200_OK)


class VerifyEmailView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token = request.data.get("token")
        if not token:
            return Response({"error": "Token là bắt buộc"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            import uuid
            token_uuid = uuid.UUID(str(token))
            user = User.objects.get(email_verification_token=token_uuid)

            if not user.is_verification_token_valid():
                return Response({"error": "Token đã hết hạn hoặc không hợp lệ"}, status=status.HTTP_400_BAD_REQUEST)

            user.verify_email()
            try:
                send_welcome_email(user)
            except Exception as e:
                print(f"Could not send welcome email: {e}")

            return Response({"message": "Email đã được xác thực thành công!", "email_verified": True}, status=status.HTTP_200_OK)
        except (ValueError, User.DoesNotExist):
            return Response({"error": "Token không hợp lệ"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ResendVerificationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user

        if user.is_email_verified:
            return Response({"message": "Email đã được xác thực"}, status=status.HTTP_200_OK)

        if not user.email:
            return Response({"error": "Không tìm thấy email của người dùng"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            verification_token = user.generate_verification_token()
            email_sent = send_verification_email(user, verification_token)
            return Response({"message": "Email xác thực đã được gửi lại", "email_sent": email_sent}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": "Không thể gửi email xác thực"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# -------------------- Yêu cầu người dùng --------------------
class CreateUserRequestView(generics.CreateAPIView):
    queryset = UserRequest.objects.all()
    serializer_class = UserRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class MyRequestsView(generics.ListAPIView):
    serializer_class = UserRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return UserRequest.objects.filter(user=self.request.user).order_by("-created_at")

# -------------------- Admin xem yêu cầu --------------------
class UserRequestListView(generics.ListAPIView):
    queryset = UserRequest.objects.all().order_by("-created_at")
    serializer_class = UserRequestSerializer
    permission_classes = [permissions.IsAdminUser]

class UserRequestDetailView(generics.RetrieveAPIView):
    queryset = UserRequest.objects.all()
    serializer_class = UserRequestSerializer
    permission_classes = [permissions.IsAdminUser]

class UserRequestApproveView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        req = get_object_or_404(UserRequest, pk=pk)
        action = request.data.get("action")
        admin_note = request.data.get("admin_note", "")

        if action not in ("approve", "reject"):
            return Response({"error": "action phải là 'approve' hoặc 'reject'."}, status=status.HTTP_400_BAD_REQUEST)

        if action == "approve":
            req.status = "approved"
            user = req.user
            if req.request_type == "shipper_register":
                user.user_type = "shipper"
            elif req.request_type == "restaurant_register":
                user.user_type = "restaurant"
            user.approval_status = "approved"
            user.save()
        else:
            req.status = "rejected"

        req.admin_note = admin_note
        req.save()
        return Response({"message": f"Request {action} thành công"}, status=status.HTTP_200_OK)

# -------------------- API lấy loại đăng ký & thành phố --------------------
@api_view(["GET"])
def get_request_choices(request):
    return Response({
        "request_types": [
            {"key": "shipper_register", "label": "Đăng ký shipper"},
            {"key": "restaurant_register", "label": "Đăng ký nhà hàng"},
        ],
        "cities": [
            {"key": "hanoi", "label": "Hà Nội"},
            {"key": "hcm", "label": "TP Hồ Chí Minh"},
            {"key": "danang", "label": "Đà Nẵng"},
        ]
    })

# -------------------- Cập nhật vị trí shipper --------------------
@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def update_shipper_location(request):
    if request.user.user_type != "shipper":
        return Response({"error": "Chỉ shipper mới có thể cập nhật vị trí"},
                        status=status.HTTP_403_FORBIDDEN)

    serializer = ShipperLocationSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response({"message": "Cập nhật vị trí thành công"})
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
