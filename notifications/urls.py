from django.urls import path
from . import views

urlpatterns = [
    path('', views.NotificationListView.as_view(), name='notification_list'),
    path('<int:pk>/', views.NotificationDetailView.as_view(), name='notification_detail'),
    path('<int:notification_id>/read/', views.mark_as_read, name='mark_as_read'),
    path('mark-all-read/', views.mark_all_as_read, name='mark_all_as_read'),
    path('unread-count/', views.unread_count, name='unread_count'),
    
    path('push-token/', views.PushTokenView.as_view(), name='push_token'),
    
    # Admin URLs
    path('templates/', views.NotificationTemplateListView.as_view(), name='notification_templates'),
    path('templates/<int:pk>/', views.NotificationTemplateDetailView.as_view(), name='notification_template_detail'),
]
