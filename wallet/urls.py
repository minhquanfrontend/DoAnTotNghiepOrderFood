from django.urls import path
from . import views

app_name = 'wallet'

urlpatterns = [
    path('', views.WalletDetail.as_view(), name='wallet-detail'),
    path('transactions/', views.TransactionList.as_view(), name='transaction-list'),
    path('top-up/', views.TopUpView.as_view(), name='top-up'),
    path('transfer/', views.TransferView.as_view(), name='transfer'),
]
