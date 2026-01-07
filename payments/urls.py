from django.urls import path
from . import views

urlpatterns = [
    path('', views.PaymentListView.as_view(), name='payment_list'),
    path('<int:pk>/', views.PaymentDetailView.as_view(), name='payment_detail'),
    path('create/', views.create_payment, name='create_payment'),
    path('<int:payment_id>/confirm/', views.confirm_payment, name='confirm_payment'),
    path('<int:payment_id>/refund/', views.request_refund, name='request_refund'),
    
    path('available-methods/', views.get_payment_methods, name='available_payment_methods'),
    path('methods/', views.PaymentMethodListView.as_view(), name='payment_methods'),
    path('methods/<int:pk>/', views.PaymentMethodDetailView.as_view(), name='payment_method_detail'),
    
    # VNPay callback only
    path('callback/vnpay/', views.vnpay_callback, name='vnpay_callback'),
]
