from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)
from .views import (
    RegisterView,
    LoginView,
    ProfileView,
    LogoutView,
    VerifyEmailView,
    ResendVerificationView,
    CreateUserRequestView,
    MyRequestsView,
    UserRequestListView,      
    UserRequestApproveView,
    update_shipper_location,
)

urlpatterns = [
    # JWT Auth
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("token/verify/", TokenVerifyView.as_view(), name="token_verify"),

    # custom auth
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("verify-email/", VerifyEmailView.as_view(), name="verify-email"),
    path("resend-verification/", ResendVerificationView.as_view(), name="resend-verification"),

    # requests
    path("requests/create/", CreateUserRequestView.as_view(), name="create_request"),
    path("my-requests/", MyRequestsView.as_view(), name="my_requests"),
    path("requests/", UserRequestListView.as_view(), name="all_requests"),  # ✅ đúng class
    path("requests/<int:pk>/approve/", UserRequestApproveView.as_view(), name="approve_request"),

    # shipper
    path("shipper/update-location/", update_shipper_location, name="update_shipper_location"),
]
