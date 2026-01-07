from django.urls import path
from . import views

urlpatterns = [
    # User Preferences
    path('preferences/', views.UserPreferenceView.as_view(), name='user_preferences'),
    path('track-view/', views.track_food_view, name='track_food_view'),
    path('like-food/', views.like_food, name='like_food'),
    path('liked-foods/', views.get_liked_foods, name='liked_foods'),
    
    # Recommendations
    path('recommendations/', views.RecommendationListView.as_view(), name='recommendations'),
    
    # Chatbot
    path('chat/sessions/', views.ChatSessionListView.as_view(), name='chat_sessions'),
    path('chat/send/', views.send_chat_message, name='send_chat_message'),
    path('chat/sessions/clear/', views.ChatSessionClearView.as_view(), name='chat-sessions-clear'),
    path("chat/sessions/<str:session_id>/", views.ChatSessionDetailView.as_view(), name="chat-session-detail"),

]
