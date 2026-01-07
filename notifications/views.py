from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import Notification, PushToken, NotificationTemplate
from .serializers import NotificationSerializer, PushTokenSerializer, NotificationTemplateSerializer

class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

class NotificationDetailView(generics.RetrieveAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if not instance.is_read:
            instance.is_read = True
            instance.read_at = timezone.now()
            instance.save()
        
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def mark_as_read(request, notification_id):
    notification = get_object_or_404(Notification, id=notification_id, user=request.user)
    notification.is_read = True
    notification.read_at = timezone.now()
    notification.save()
    
    return Response({'message': 'Đã đánh dấu đã đọc'})

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def mark_all_as_read(request):
    Notification.objects.filter(user=request.user, is_read=False).update(
        is_read=True,
        read_at=timezone.now()
    )
    
    return Response({'message': 'Đã đánh dấu tất cả đã đọc'})

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def unread_count(request):
    count = Notification.objects.filter(user=request.user, is_read=False).count()
    return Response({'unread_count': count})

class PushTokenView(generics.CreateAPIView):
    serializer_class = PushTokenSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def create(self, request, *args, **kwargs):
        token = request.data.get('token')
        device_type = request.data.get('device_type')
        
        if not token or not device_type:
            return Response({'error': 'Token và device_type là bắt buộc'}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        # Cập nhật hoặc tạo mới push token
        push_token, created = PushToken.objects.update_or_create(
            user=request.user,
            token=token,
            defaults={'device_type': device_type, 'is_active': True}
        )
        
        return Response({
            'message': 'Đã cập nhật push token',
            'created': created
        })

# Utility functions for creating notifications
def create_notification(user, notification_type, context=None):
    """Tạo thông báo từ template"""
    try:
        template = NotificationTemplate.objects.get(
            notification_type=notification_type,
            is_active=True
        )
        title, message = template.render(context)
        
        notification = Notification.objects.create(
            user=user,
            notification_type=notification_type,
            title=title,
            message=message,
            data=context
        )
        
        # TODO: Send push notification
        send_push_notification(notification)
        
        return notification
    except NotificationTemplate.DoesNotExist:
        return None

def send_push_notification(notification):
    """Gửi push notification"""
    # TODO: Implement push notification với Expo
    pass

# Admin views
class NotificationTemplateListView(generics.ListCreateAPIView):
    queryset = NotificationTemplate.objects.all()
    serializer_class = NotificationTemplateSerializer
    permission_classes = [permissions.IsAdminUser]

class NotificationTemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = NotificationTemplate.objects.all()
    serializer_class = NotificationTemplateSerializer
    permission_classes = [permissions.IsAdminUser]
