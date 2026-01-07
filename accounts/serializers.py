from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User, UserRequest


# -------------------- Đăng ký --------------------
class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = (
            "username", "email", "password", "password_confirm",
            "first_name", "last_name", "phone_number", "address"
        )
        extra_kwargs = {
            "email": {"required": True},
            "first_name": {"required": False},
            "last_name": {"required": False},
            "phone_number": {"required": False},
            "address": {"required": False},
        }

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Mật khẩu không khớp"})
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm", None)
        password = validated_data.pop("password")
        user = User.objects.create_user(password=password, **validated_data)
        return user


# -------------------- Đăng nhập --------------------
class UserLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        username = attrs.get("username")
        password = attrs.get("password")

        if not username or not password:
            raise serializers.ValidationError("Vui lòng nhập tên đăng nhập và mật khẩu")

        # Allow logging in using email as well
        lookup_username = username
        try:
            if "@" in username and not User.objects.filter(username=username).exists():
                u = User.objects.filter(email__iexact=username).first()
                if u:
                    lookup_username = u.username
        except Exception:
            pass

        user = authenticate(
            request=self.context.get("request"),
            username=lookup_username,
            password=password
        )

        if not user:
            raise serializers.ValidationError("Tên đăng nhập hoặc mật khẩu không đúng")
        if not user.is_active:
            raise serializers.ValidationError("Tài khoản đã bị khóa")

        attrs["user"] = user
        return attrs


# -------------------- Hồ sơ người dùng --------------------
class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id", "username", "email", "first_name", "last_name",
            "phone_number", "address", "avatar", "date_of_birth",
            "user_type", "approval_status"
        )
        read_only_fields = ("id", "username", "user_type", "approval_status")


# -------------------- Yêu cầu người dùng --------------------
class UserRequestSerializer(serializers.ModelSerializer):
    cccd_front = serializers.ImageField(required=True)
    cccd_back = serializers.ImageField(required=True)

    class Meta:
        model = UserRequest
        fields = [
            "id",
            "request_type",
            "full_name",
            "phone",
            "city",
            "id_number",
            "ref_source",
            "note",
            "cccd_front",
            "cccd_back",
            "status",
            "admin_note",
            "created_at",
        ]
        read_only_fields = ("status", "admin_note", "created_at")

    def create(self, validated_data):
        request = self.context.get("request")
        validated_data["user"] = request.user

        # Cập nhật profile user nếu cần
        full = validated_data.get("full_name")
        if full:
            parts = full.split(" ", 1)
            user = request.user
            user.last_name = parts[0]
            user.first_name = parts[1] if len(parts) > 1 else user.first_name
            user.phone_number = validated_data.get("phone", user.phone_number)
            user.address = validated_data.get("city", user.address)
            user.save()

        return super().create(validated_data)


# -------------------- Vị trí shipper --------------------
class ShipperLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("current_latitude", "current_longitude", "is_available")
