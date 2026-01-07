import json
import os
import re
import random
import unicodedata
import uuid
import numpy as np
from typing import Dict, List, Optional, Any, Tuple
from django.utils import timezone
from django.db import transaction
from django.db.models import Q, F, Case, When, Value, IntegerField
from datetime import datetime, timedelta
import openai
from django.conf import settings
import jellyfish
import requests
from urllib.parse import urljoin

from .models import ChatIntent, ChatEntity, ChatSession, ChatMessage, UserPreference, FoodRecommendation
from restaurants.models import Food, Restaurant, Category
from orders.models import Order, OrderItem, Cart, CartItem
from django.contrib.auth import get_user_model
from django.contrib.auth.models import User

# Vietnamese character mapping for diacritic removal
VIETNAMESE_MAP = {
    'a': 'aàáạảãâầấậẩẫăằắặẳẵ',
    'e': 'eèéẹẻẽêềếệểễ',
    'i': 'iìíịỉĩ',
    'o': 'oòóọỏõôồốộổỗơờớợởỡ',
    'u': 'uùúụủũưừứựửữ',
    'y': 'yỳýỵỷỹ',
    'd': 'dđ',
}

# Delivery fee configuration
DELIVERY_FEE = 15000  # 15,000 VND base delivery fee
MIN_ORDER_AMOUNT = 10000  # 10,000 VND minimum order
FREE_DELIVERY_THRESHOLD = 50000  # Free delivery for orders above 50,000 VND

# Vietnamese character mapping for diacritic removal
VIETNAMESE_MAP = {
    'a': 'aàáạảãâầấậẩẫăằắặẳẵ',
    'e': 'eèéẹẻẽêềếệểễ',
    'i': 'iìíịỉĩ',
    'o': 'oòóọỏõôồốộổỗơờớợởỡ',
    'u': 'uùúụủũưừứựửữ',
    'y': 'yỳýỵỷỹ',
    'd': 'dđ',
}

# Delivery fee configuration
DELIVERY_FEE = 15000  # 15,000 VND base delivery fee
MIN_ORDER_AMOUNT = 10000  # 10,000 VND minimum order
FREE_DELIVERY_THRESHOLD = 50000  # Free delivery for orders above 50,000 VND

# Load training data
TRAINING_DATA_PATH = os.path.join(os.path.dirname(__file__), 'data', 'training_data.json')
QA_DATASET_PATH = os.path.join(os.path.dirname(__file__), 'data', 'qa_dataset.json')

def load_training_data():
    """Load training data from JSON file"""
    try:
        with open(TRAINING_DATA_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('intents', [])
    except Exception as e:
        print(f"Error loading training data: {e}")
        return []

def load_qa_dataset():
    """Load QA dataset from JSON file"""
    try:
        with open(QA_DATASET_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading QA dataset: {e}")
        return []

# Preload datasets for faster access
TRAINING_DATA = load_training_data()
QA_DATASET = load_qa_dataset()

class FoodOrderingChatbot:
    """AI-powered food ordering chatbot service"""
    
    def __init__(self, user=None, session_id=None):
        self.user = user
        # Initialize with None first
        self.session = None
        self.context = {}
        
        try:
            self.session = self._get_or_create_session(session_id)
            self.context = self._initialize_context()
            # Initialize OpenAI API
            openai.api_key = settings.OPENAI_API_KEY
        except Exception as e:
            print(f"Error initializing chatbot: {str(e)}")
            # Create a minimal session if initialization fails
            self.session = ChatSession.objects.create(
                user=user,
                session_id=str(uuid.uuid4()),
                title=f"Chat {timezone.now().strftime('%Y-%m-%d %H:%M')}"
            )
            self.context = self._initialize_context()
    
    def _get_or_create_session(self, session_id=None) -> ChatSession:
        """Get or create a chat session with error handling"""
        try:
            if session_id:
                try:
                    return ChatSession.objects.get(session_id=session_id, user=self.user)
                except ChatSession.DoesNotExist:
                    pass
            
            recent_session = self._get_recent_session()
            if recent_session:
                return recent_session

            # Create new session
            session = ChatSession.objects.create(
                user=self.user,
                session_id=session_id or str(uuid.uuid4()),
                title=f"Chat {timezone.now().strftime('%Y-%m-%d %H:%M')}"
            )
            return session
            
        except Exception as e:
            print(f"Error in _get_or_create_session: {str(e)}")
            # Create a minimal session in case of any error
            return ChatSession.objects.create(
                user=self.user,
                session_id=str(uuid.uuid4()),
                title=f"Chat {timezone.now().strftime('%Y-%m-%d %H:%M')}"
            )

    def _get_recent_session(self) -> Optional[ChatSession]:
        try:
            return (ChatSession.objects
                    .filter(user=self.user)
                    .order_by('-updated_at')
                    .first())
        except ChatSession.DoesNotExist:
            return None
    
    def _initialize_context(self) -> Dict[str, Any]:
        """Initialize chat context with user data"""
        context = {
            'user': {
                'is_authenticated': self.user.is_authenticated if self.user else False,
                'preferences': {},
                'recent_orders': [],
                'cart_items': []
            },
            'current_order': {
                'items': [],
                'restaurant': None,
                'delivery_address': None,
                'payment_method': None
            },
            'conversation': {
                'intent': None,
                'entities': {},
                'last_intent': None,
                'state': 'greeting',  # greeting, taking_order, confirming_order, etc.
                'pending_actions': []
            }
        }

        return context

    def _get_taste_recommendations(self, preference: str, limit: int = 4) -> List[Dict[str, Any]]:
        queryset = Food.objects.filter(is_available=True)
        preference = preference or ''

        if preference == 'spicy':
            keywords = ['cay', 'sa te', 'tiu', 'lẩu thái', 'kim chi']
            queryset = queryset.filter(
                Q(name__icontains='cay') |
                Q(description__icontains='cay') |
                Q(category__name__icontains='cay')
            )
        elif preference == 'sweet':
            queryset = queryset.filter(
                Q(category__name__icontains='tráng miệng') |
                Q(category__name__icontains='đồ uống') |
                Q(description__icontains='ngọt') |
                Q(name__icontains='ngọt')
            )
        elif preference == 'healthy':
            queryset = queryset.filter(
                Q(name__icontains='salad') |
                Q(description__icontains='healthy') |
                Q(description__icontains='eat clean') |
                Q(category__name__icontains='salad') |
                Q(category__name__icontains='healthy')
            )
        elif preference == 'vegetarian':
            queryset = queryset.filter(
                Q(name__icontains='chay') |
                Q(description__icontains='chay') |
                Q(category__name__icontains='chay')
            )
        elif preference == 'light':
            queryset = queryset.filter(
                Q(description__icontains='thanh đạm') |
                Q(name__icontains='thanh đạm') |
                Q(name__icontains='cháo') |
                Q(name__icontains='súp')
            )
        else:
            # general taste request -> pick top rated mixed items
            queryset = queryset.order_by('-rating', '-total_orders')

        foods = queryset.select_related('restaurant', 'category').order_by('-rating', '-total_orders')[:limit]
        result = []
        for food in foods:
            result.append({
                'id': str(food.id),
                'name': food.name,
                'description': food.description or 'Món ngon đang rất được yêu thích.',
                'price': float(food.price) if food.price else 0,
                'formatted_price': f"{int(food.price):,}đ" if food.price else 'Liên hệ',
                'image': food.image.url if food.image and hasattr(food.image, 'url') else None,
                'restaurant': food.restaurant.name if food.restaurant else 'Nhà hàng',
                'category': food.category.name if food.category else 'Khác'
            })
        return result

    def _handle_taste_preference(self, preference_data: Dict[str, str]) -> Dict[str, Any]:
        preference = preference_data.get('preference', 'general')
        foods = self._get_taste_recommendations(preference)

        readable_map = {
            'spicy': 'món cay đậm đà',
            'sweet': 'đồ ngọt & tráng miệng',
            'healthy': 'option healthy/ít dầu mỡ',
            'vegetarian': 'món chay thanh đạm',
            'light': 'món nhẹ bụng',
            'general': 'món hợp khẩu vị'
        }
        intro_map = {
            'spicy': 'Bạn thích ăn cay? Thử ngay những món cay vui miệng này:',
            'sweet': 'Gu ngọt ngào đây rồi! Mời bạn thử:',
            'healthy': 'Giữ dáng mà vẫn ngon với các món healthy:',
            'vegetarian': 'Các món chay được ưa chuộng nhất:',
            'light': 'Khẩu vị thanh đạm thì những món sau rất hợp:',
            'general': 'Dựa trên khẩu vị bạn mô tả, mình gợi ý:'
        }

        if not foods:
            return {
                'type': 'advice',
                'text': 'Tạm thời chưa có món đúng khẩu vị, bạn thử diễn tả cụ thể hơn (ví dụ: thích cay/ngọt/chay) nhé!',
                'suggestions': ['Gợi ý món khác', 'Xem thực đơn', 'Tư vấn khẩu vị']
            }

        detail_lines = [f"• {item['name']} ({item['formatted_price']}) - {item['restaurant']}" for item in foods]

        return {
            'type': 'food_recommendation',
            'text': f"{intro_map.get(preference, intro_map['general'])}\n\n" + "\n".join(detail_lines),
            'metadata': {
                'preference': preference,
                'label': readable_map.get(preference, readable_map['general']),
                'recommendations': foods
            },
            'suggestions': ['Đặt ngay món này', 'Xem thêm khẩu vị khác', 'Xem thực đơn đầy đủ']
        }

      
    
    def process_message(self, message: str) -> Dict[str, Any]:
        """Process user message and return bot response"""
        print("\n=== Processing Message ===")
        print(f"Message: {message}")
        
        try:
            # Ensure session exists robustly
            if not hasattr(self, 'session') or self.session is None:
                print("No active session found, creating a new one...")
                try:
                    self.session = self._get_or_create_session()
                    print(f"Created new session: {self.session.session_id}")
                except Exception as e:
                    print(f"Error creating session: {str(e)}")
                    try:
                        # Try one more time with a simpler session creation
                        self.session = ChatSession.objects.create(
                            user=self.user,
                            session_id=str(uuid.uuid4()),
                            title=f"Chat {timezone.now().strftime('%Y-%m-%d %H:%M')}"
                        )
                        print("Successfully created session with fallback method")
                    except Exception as fallback_error:
                        print(f"Fallback session creation failed: {str(fallback_error)}")
                        return {
                            'type': 'error',
                            'text': 'Xin lỗi, không thể khởi tạo phiên làm việc. Vui lòng thử lại sau.',
                            'suggestions': ['Tải lại trang', 'Liên hệ hỗ trợ'],
                            'metadata': {
                                'error': str(fallback_error),
                                'timestamp': timezone.now().isoformat()
                            }
                        }
            
            # Ensure we have a valid session
            if not hasattr(self, 'session') or self.session is None:
                return {
                    'type': 'error',
                    'text': 'Không thể khởi tạo phiên làm việc. Vui lòng thử lại.',
                    'suggestions': ['Tải lại trang', 'Liên hệ hỗ trợ']
                }
                
            session_id = getattr(self.session, 'session_id', 'UNKNOWN_SESSION')
            print(f"Using session ID: {session_id}")
            
            # Save user message to database
            try:
                user_msg = ChatMessage.objects.create(
                    session=self.session,
                    message_type='user',
                    content=message
                )
                print(f"User message saved with ID: {user_msg.id}")
            except Exception as e:
                print(f"Error saving user message: {str(e)}")
            
            # First, try to find a matching QA pair
            qa_response = self._find_matching_qa(message)
            if qa_response:
                print("Found matching QA pair")
                return qa_response
            
            # If no QA match, analyze the message for intent and entities
            print("No QA match, analyzing message...")
            try:
                intent, entities = self._analyze_message(message)
                print(f"Detected intent: {intent}")
                print(f"Extracted entities: {entities}")
                
                # Add message to context
                if 'message' not in entities:
                    entities['message'] = message
                
                # Generate response based on intent and entities
                response = self._generate_response(intent, entities)
                
                # Add timestamp and session info
                if 'metadata' not in response:
                    response['metadata'] = {}
                    
                response['metadata'].update({
                    'timestamp': timezone.now().isoformat(),
                    'session_id': str(self.session.session_id) if self.session else None,
                    'intent': intent,
                    'entities': entities
                })
                
                print(f"Generated response: {response.get('type', 'unknown')}")
                return response
                
            except Exception as e:
                error_msg = f"Error in message processing: {str(e)}"
                print(f"Error: {str(e)}")
                import traceback
                error_trace = traceback.format_exc()
                print(error_trace)
                
                # More specific error handling
                error_type = type(e).__name__
                error_message = str(e).lower()
                
                # Common error patterns and their friendly responses
                error_responses = {
                    'not found': "Xin lỗi, tôi không tìm thấy thông tin bạn cần.",
                    'permission': "Bạn cần đăng nhập để thực hiện thao tác này.",
                    'database': "Có lỗi xảy ra khi truy vấn dữ liệu.",
                    'validation': "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại thông tin.",
                    'network': "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.",
                    'timeout': "Yêu cầu của bạn đã hết thời gian chờ. Vui lòng thử lại sau."
                }
                
                # Find the most appropriate error message
                response_text = "Xin lỗi, đã xảy ra lỗi khi xử lý yêu cầu của bạn."
                for key, message in error_responses.items():
                    if key in error_message:
                        response_text = message
                        break
                
                # Add more context if it's a known error type
                if error_type == 'DoesNotExist':
                    response_text = "Không tìm thấy dữ liệu bạn yêu cầu."
                elif error_type == 'MultipleObjectsReturned':
                    response_text = "Có nhiều kết quả phù hợp. Vui lòng cung cấp thêm thông tin."
                
                return {
                    'type': 'error',
                    'text': response_text,
                    'suggestions': ['Thử lại', 'Xem thực đơn', 'Liên hệ hỗ trợ'],
                    'metadata': {
                        'error_type': error_type,
                        'error_message': str(e),
                        'timestamp': timezone.now().isoformat(),
                        'original_message': message,
                        'debug_info': error_trace if settings.DEBUG else None
                    }
                }
                
        except Exception as e:
            error_msg = f"Unexpected error in process_message: {str(e)}"
            print(error_msg)
            import traceback
            error_trace = traceback.format_exc()
            print(error_trace)
            
            # Provide a user-friendly error message
            return {
                'type': 'error',
                'text': "Xin lỗi, đã xảy ra lỗi không mong muốn. Đội ngũ kỹ thuật đã được thông báo.",
                'suggestions': ['Thử lại', 'Liên hệ hỗ trợ'],
                'metadata': {
                    'error_type': 'UnexpectedError',
                    'error_message': str(e),
                    'timestamp': timezone.now().isoformat(),
                    'debug_info': error_trace if settings.DEBUG else None
                }
            }
            

    def _normalize_text(self, text: str) -> str:
        """Normalize Vietnamese text by removing diacritics and standardizing
        
        Args:
            text: Input text to normalize
            
        Returns:
            Normalized text with diacritics removed and standardized
        """
        if not text or not isinstance(text, str):
            return ''
            
        # Convert to lowercase and trim
        text = text.lower().strip()
        
        # Remove extra whitespace and special characters
        text = re.sub(r'[^\w\s]', ' ', text)  # Keep only alphanumeric and space
        text = re.sub(r'\s+', ' ', text)  # Replace multiple spaces with single space
        
        # Create a mapping of characters with diacritics to their base form
        char_map = {}
        for base_char, variants in VIETNAMESE_MAP.items():
            for variant in variants[1:]:  # Skip the first character (base character)
                char_map[variant] = base_char
        
        # Replace each character with its base form
        normalized_text = ''
        for char in text:
            normalized_text += char_map.get(char, char)
        
        # Standardize common variations (both with and without diacritics)
        replacements = {
            'khong': 'không',
            'ko': 'không',
            'co': 'có',
            'duoc': 'được',
            'dc': 'được',
            'nguoi': 'người',
            'ng': 'người',
            'vay': 'vậy',
            'v': 'vậy',
            'thoi': 'thôi',
            'th': 'thôi',
            'j': 'gì',
            'gi': 'gì',
            'k': 'không',
            'm': 'mình',
            't': 'tôi',
            'b': 'bạn',
            'dc': 'được',
            'r': 'rồi',
            'z': 'vậy',
            'f': 'phải',
            'thik': 'thích',
            'tk': 'tiền',
            'tks': 'cảm ơn',
            'thanks': 'cảm ơn',
            'thank you': 'cảm ơn',
            'cam on': 'cảm ơn',
            'ok': 'đồng ý',
            'oke': 'đồng ý',
            'okie': 'đồng ý',
            'okela': 'đồng ý'
        }
        
        # Replace each variation with its standard form
        for old, new in replacements.items():
            normalized_text = re.sub(r'\b' + re.escape(old) + r'\b', new, normalized_text)
            
        return normalized_text.strip()
        
    def _is_food_query(self, message: str) -> bool:
        """Check if the message is likely a food search query"""
        if not message or not isinstance(message, str) or not message.strip():
            return False
            
        # Common food-related keywords
        food_keywords = [
            'thịt', 'gà', 'bò', 'heo', 'cá', 'tôm', 'mực', 'cua', 'ghẹ', 'lươn',
            'cơm', 'phở', 'bún', 'miến', 'hủ tiếu', 'bánh', 'xôi', 'cháo', 'lẩu', 'nướng',
            'chiên', 'xào', 'hấp', 'kho', 'rán', 'nấu', 'súp', 'gỏi', 'nem', 'chả',
            'rau', 'củ', 'quả', 'trái cây', 'tráng miệng', 'nước', 'trà', 'cà phê', 'sinh tố'
        ]
        
        # Check if any food keyword is in the message
        message_lower = message.lower()
        return any(keyword in message_lower for keyword in food_keywords)
        
    def _detect_contextual_request(self, message: str) -> Optional[Dict[str, str]]:
        """Detect weather/mood cues (vd: trời nóng/lạnh) to serve custom suggestions"""
        if not message or not isinstance(message, str):
            return None

        normalized = self._normalize_text(message.lower().strip())
        if not normalized:
            return None

        hot_keywords = [
            'troi nong', 'nong qua', 'nong oi', 'nong buc', 'nong chan', 'nong nuc',
            'nong qua troi', 'nong qua di', 'oi buc', 'giai khat', 'khat nuoc', 'nhiet do tang',
            'nong qua minh nen uong gi', 'nong qua uong gi'
        ]
        cold_keywords = [
            'troi lanh', 'lanh qua', 'lanh qua troi', 'lanh qua di', 'lanh that', 'ret qua',
            'ret cut', 'ret doi', 'troi ret', 'troi mua', 'troi am u', 'lanh bung', 'lanh bung qua',
            'lanh qua an gi', 'troi lanh an gi'
        ]

        if any(keyword in normalized for keyword in hot_keywords):
            return {'context': 'hot', 'original': message}
        if any(keyword in normalized for keyword in cold_keywords):
            return {'context': 'cold', 'original': message}
        return None

    def _detect_taste_preference(self, message: str) -> Optional[Dict[str, str]]:
        """Detect when user mentions khẩu vị (spicy, ngọt, healthy, chay, thanh đạm)"""
        if not message or not isinstance(message, str):
            return None

        normalized = self._normalize_text(message.lower().strip())
        if not normalized:
            return None

        preference_map = {
            'spicy': ['an cay', 'mon cay', 'cay qua', 'cay cay', 'spicy', 'cay nong'],
            'sweet': ['do ngot', 'mon ngot', 'an ngot', 'thich ngot', 'banh ngot', 'tra sua ngot'],
            'healthy': ['an healthy', 'an kieng', 'eat clean', 'salad', 'mon nhe', 'it dau mo', 'tot cho suc khoe'],
            'vegetarian': ['an chay', 'mon chay', 'khong an thit', 'khong an dong vat'],
            'light': ['thanh dam', 'an nhe', 'mon nhe', 'de tieu', 'nhat thoi'],
        }

        if 'khau vi' in normalized or 'gu an' in normalized or 'thich an gi' in normalized:
            return {'preference': 'general', 'original': message}

        for preference, keywords in preference_map.items():
            if any(keyword in normalized for keyword in keywords):
                return {'preference': preference, 'original': message}
        return None

    def _find_matching_qa(self, message: str) -> Optional[Dict[str, Any]]:
        """Find matching question-answer pair from the QA dataset with enhanced Vietnamese support"""
        try:
            if not message or not isinstance(message, str) or not message.strip():
                return None

            # Skip QA matching for order status requests
            if re.search(r'(?:đơn|don|#)\s*\d+', message, re.IGNORECASE):
                return None

            # Skip QA matching if this looks like a food query
            if self._is_food_query(message):
                return None

            contextual_req = self._detect_contextual_request(message)
            if contextual_req:
                return self._handle_contextual_suggestion(contextual_req)

            taste_pref = self._detect_taste_preference(message)
            if taste_pref:
                return self._handle_taste_preference(taste_pref)

            # Define common delivery-related questions and responses
            delivery_questions = {
                r'(giao hàng|vận chuyển|ship hàng|thời gian giao)': {
                    'text': "Chúng tôi giao hàng trong vòng 30-45 phút. Bạn có thể theo dõi đơn hàng sau khi đặt.",
                    'suggestions': ['Theo dõi đơn hàng', 'Xem thực đơn']
                },
                r'(phí giao hàng|tiền ship|phí ship|ship bao nhiêu)': {
                    'text': "Phí giao hàng là 15.000đ cho đơn dưới 50.000đ. Đơn từ 50.000đ trở lên được miễn phí giao hàng.",
                    'suggestions': ['Đặt món ngay', 'Xem thực đơn']
                },
                r'(thời gian giao hàng|bao lâu có hàng|khi nào nhận được)': {
                    'text': "Thời gian giao hàng dự kiến từ 20-45 phút tùy vào địa chỉ và tình trạng giao thông.",
                    'suggestions': ['Xem thực đơn', 'Kiểm tra đơn hàng']
                },
                r'(thanh toán|trả tiền|tiền hàng|tiền ship)': {
                    'text': "Chúng tôi hỗ trợ thanh toán khi nhận hàng (COD) hoặc thanh toán online qua ví điện tử.",
                    'suggestions': ['Thanh toán khi nhận hàng', 'Thanh toán online']
                },
                r'(khuyến mãi|giảm giá|ưu đãi|mã giảm giá|voucher)': {
                    'text': "Hiện đang có chương trình giảm giá 20% cho đơn hàng đầu tiên. Nhập mã 'WELCOME20' khi đặt hàng để nhận ưu đãi.",
                    'suggestions': ['Xem thực đơn', 'Đặt món ngay']
                }
            }

            # Normalize the message for better matching
            message = self._normalize_text(message.lower().strip())
            if not message:
                return None

            # First, check training data
            best_match = self._find_best_match(message, TRAINING_DATA)
            if best_match and best_match['score'] > 0.7:  # Threshold for good match
                response = random.choice(best_match['intent']['responses'])
                if '%s' in response and best_match.get('entity'):
                    response = response % best_match['entity']
                
                return {
                    'type': best_match['intent']['tag'],
                    'text': response,
                    'suggestions': best_match['intent'].get('suggestions', []),
                    'metadata': {
                        'intent': best_match['intent']['tag'],
                        'confidence': best_match['score']
                    }
                }

            # Check regex patterns for delivery questions
            for pattern, response in delivery_questions.items():
                if re.search(pattern, message, re.IGNORECASE):
                    return {
                        'type': 'advice',
                        **response
                    }

            # Check for exact matches in QA dataset first
            for qa in QA_DATASET:
                if self._normalize_text(qa['question']) == message:
                    return qa['response']

            # Check for partial matches with better Vietnamese word boundary handling
            for qa in QA_DATASET:
                q_clean = self._normalize_text(qa['question'])
                if q_clean in message or any(word in message.split() for word in q_clean.split()):
                    return qa['response']

            # Enhanced food order intent detection
            order_keywords = [
                'tôi muốn', 'cho tôi', 'đặt món', 'gọi món', 'mua', 'cần đặt',
                'ăn', 'uống', 'món', 'phở', 'bún', 'cơm', 'bánh', 'nước', 'trà', 'cafe'
            ]
            
            if any(re.search(rf'\b{re.escape(keyword)}\b', message) for keyword in order_keywords):
                # Extract food item with better Vietnamese pattern matching
                food_entities = self._extract_food_entities(message)
                
                if food_entities and 'food_item' in food_entities:
                    food_name = food_entities['food_item']
                    
                    # Fetch food items from API
                    food_items = self._fetch_food_items(food_name)
                    
                    if food_items:
                        # Format the food items for display
                        formatted_foods = self._format_food_items(food_items)
                        return {
                            'type': 'food_list',
                            'text': f'Đây là các món {food_name} có sẵn:\n\n{formatted_foods}',
                            'items': food_items,
                            'suggestions': ['Xem thực đơn', 'Tìm món khác']
                        }
                    else:
                        return {
                            'type': 'advice',
                            'text': f'Xin lỗi, hiện không có món {food_name} trong thực đơn.',
                            'suggestions': ['Xem thực đơn', 'Tìm món khác']
                        }

            # If no match found, provide a helpful fallback
            return {
                'type': 'advice',
                'text': "Xin lỗi, tôi chưa hiểu rõ yêu cầu của bạn. Bạn có thể diễn đạt lại hoặc chọn một trong các tùy chọn dưới đây:",
                'suggestions': ['Xem thực đơn', 'Đặt món', 'Hỏi về khuyến mãi', 'Liên hệ hỗ trợ']
            }

        except Exception as e:
            print(f"Error in _find_matching_qa: {str(e)}")
            return {
                'type': 'error',
                'text': "Xin lỗi, đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại sau.",
                'suggestions': ['Thử lại', 'Liên hệ hỗ trợ']
            }

        

    def _search_food_in_database(self, food_name: str) -> List[Dict[str, Any]]:
        """Search for food items in the database that match the given name"""
        from restaurants.models import Food
        
        # First try exact match
        exact_matches = Food.objects.filter(
            Q(name__iexact=food_name) | 
            Q(description__icontains=food_name),
            is_available=True
        )
        
        if exact_matches.exists():
            return [{
                'id': str(food.id),
                'name': food.name,
                'description': food.description or 'Món ngon hấp dẫn',
                'price': float(food.price) if food.price else 0,
                'formatted_price': f"{int(food.price):,}đ" if food.price else 'Liên hệ',
                'image': food.image.url if food.image and hasattr(food.image, 'url') else None,
                'category': food.category.name if food.category else 'Khác'
            } for food in exact_matches]
        
        # If no exact matches, try partial match
        partial_matches = Food.objects.filter(
            Q(name__icontains=food_name) | 
            Q(description__icontains=food_name),
            is_available=True
        )[:5]  # Limit to 5 results
        
        return [{
            'id': str(food.id),
            'name': food.name,
            'description': food.description or 'Món ngon hấp dẫn',
            'price': float(food.price) if food.price else 0,
            'formatted_price': f"{int(food.price):,}đ" if food.price else 'Liên hệ',
            'image': food.image.url if food.image and hasattr(food.image, 'url') else None,
            'category': food.category.name if food.category else 'Khác'
        } for food in partial_matches]
        
    def _handle_find_food(self, entities: Dict[str, Any]) -> Dict[str, Any]:
        """Tìm kiếm món ăn và hiển thị thông tin chi tiết
        
        Args:
            entities: Dictionary chứa thông tin về món ăn cần tìm
            
        Returns:
            Dict chứa thông tin các món ăn tìm thấy, kèm thông tin nhà hàng
        """
        try:
            from restaurants.models import Food, Restaurant
            from django.db.models import Q, F, Value, CharField
            from django.db.models.functions import Concat
            from django.conf import settings
            
            food_item = entities.get('food_item', '').strip()
            quantity = int(entities.get('quantity', 1))
            
            if not food_item:
                return {
                    'type': 'text',
                    'text': 'Xin vui lòng nhập tên món ăn bạn muốn tìm kiếm.',
                    'suggestions': ['Xem thực đơn', 'Món ngon hôm nay', 'Đặt món khác']
                }
            
            # Tạo query tìm kiếm linh hoạt
            search_terms = food_item.split()
            
            # Tìm kiếm chính xác trước
            exact_query = Q(name__iexact=food_item) | Q(description__icontains=food_item)
            food_items = Food.objects.filter(
                exact_query,
                is_available=True
            ).select_related('restaurant', 'category')
            
            # Nếu không tìm thấy kết quả chính xác, tìm kiếm mở rộng
            if not food_items.exists():
                query = Q()
                for term in search_terms:
                    if len(term) > 2:  # Chỉ tìm các từ có từ 3 ký tự trở lên
                        query |= Q(name__icontains=term) | Q(description__icontains=term)
                
                if query:
                    food_items = Food.objects.filter(
                        query,
                        is_available=True
                    ).select_related('restaurant', 'category')
            
            # Nếu vẫn không tìm thấy, gợi ý món tương tự
            if not food_items.exists():
                similar_foods = Food.objects.annotate(
                    full_text=Concat('name', Value(' '), 'description', output_field=CharField())
                ).filter(
                    full_text__icontains=search_terms[0],
                    is_available=True
                ).select_related('restaurant', 'category')[:5]
                
                if similar_foods:
                    suggestions = [f"Xem {food.name}" for food in similar_foods[:3]]
                    return {
                        'type': 'text',
                        'text': f'Không tìm thấy món "{food_item}". Bạn có thể tham khảo một số món tương tự:',
                        'suggestions': suggestions + ['Xem thực đơn', 'Đặt món khác']
                    }
                else:
                    return {
                        'type': 'text',
                        'text': f'Xin lỗi, chúng tôi không tìm thấy món "{food_item}". Vui lòng thử tìm kiếm với từ khóa khác.',
                        'suggestions': ['Xem thực đơn', 'Món ngon hôm nay', 'Đặt món khác']
                    }
            
            # Sắp xếp kết quả theo đánh giá và giá cả
            food_items = food_items.order_by('-restaurant__rating', 'price')
            
            # Chuẩn bị dữ liệu món ăn để hiển thị
            food_list = []
            
            for food in food_items:
                # Lấy URL ảnh đầy đủ nếu có
                image_url = None
                if food.image and hasattr(food.image, 'url'):
                    try:
                        base_url = getattr(settings, 'BASE_URL', '')
                        if base_url:
                            image_url = f"{base_url.rstrip('/')}{food.image.url}"
                        else:
                            image_url = food.image.url
                    except Exception as e:
                        print(f"Error getting image URL: {str(e)}")
                        image_url = food.image.url
                
                # Safely get restaurant attributes with defaults
                restaurant = food.restaurant
                restaurant_data = {
                    'id': str(restaurant.id),
                    'name': getattr(restaurant, 'name', 'Nhà hàng'),
                    'address': getattr(restaurant, 'address', 'Đang cập nhật'),
                    'rating': float(getattr(restaurant, 'rating', 0)) or 0,
                    'delivery_fee': float(getattr(restaurant, 'delivery_fee', 0)) or 0,
                    'min_order': float(getattr(restaurant, 'min_order', 0)) or 0,
                    'estimated_delivery_time': f"{getattr(restaurant, 'estimated_delivery_time', '30-45')} phút"
                }
                
                food_data = {
                    'food_id': str(food.id),
                    'food_name': food.name,
                    'description': food.description or 'Món ngon hấp dẫn',
                    'price': float(food.price) if food.price else 0,
                    'formatted_price': f"{int(food.price):,}đ" if food.price else 'Liên hệ',
                    'image': image_url,
                    'category': food.category.name if food.category else 'Khác',
                    'restaurant': restaurant_data
                }
                food_list.append(food_data)
            
            # Trả về danh sách món ăn dưới dạng recommendations
            return {
                'type': 'food_recommendation',
                'text': f'Đã tìm thấy {len(food_list)} món phù hợp với "{food_item}":',
                'metadata': {
                    'recommendations': food_list,
                    'query': food_item
                },
                'suggestions': ['Xem thêm', 'Đặt món khác', 'Xem giỏ hàng']
            }
            
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"Error in _handle_find_food: {str(e)}\n{error_details}")
            return {
                'type': 'error',
                'text': 'Đã xảy ra lỗi khi tìm kiếm món ăn. Vui lòng thử lại sau.',
                'suggestions': ['Thử lại', 'Xem thực đơn', 'Liên hệ hỗ trợ']
            }
    
    def _get_contextual_recommendations(self, context: str, limit: int = 4) -> List[Dict[str, Any]]:
        """Fetch foods suitable for contextual cues (hot weather vs cold weather)"""
        context = context or ''
        queryset = Food.objects.filter(is_available=True)

        if context == 'hot':
            keywords = ['nước', 'trà', 'trà sữa', 'sinh tố', 'đá xay', 'nước ép', 'smoothie', 'yaourt', 'salad', 'chè']
            cold_categories = ['đồ uống', 'thức uống', 'giải khát', 'tráng miệng']
            query = Q()
            for kw in keywords:
                query |= Q(name__icontains=kw) | Q(description__icontains=kw)
            queryset = queryset.filter(query | Q(category__name__in=cold_categories))
        elif context == 'cold':
            keywords = ['lẩu', 'nướng', 'súp', 'hầm', 'om', 'kho', 'mì nóng', 'cháo']
            warm_categories = ['lẩu', 'đồ nướng', 'món nóng']
            query = Q()
            for kw in keywords:
                query |= Q(name__icontains=kw) | Q(description__icontains=kw)
            queryset = queryset.filter(query | Q(category__name__in=warm_categories))
        else:
            queryset = queryset.none()

        foods = queryset.select_related('restaurant', 'category').order_by('-rating', '-total_orders')[:limit]
        result = []
        for food in foods:
            result.append({
                'id': str(food.id),
                'name': food.name,
                'description': food.description or 'Món ngon đang rất được yêu thích.',
                'price': float(food.price) if food.price else 0,
                'formatted_price': f"{int(food.price):,}đ" if food.price else 'Liên hệ',
                'image': food.image.url if food.image and hasattr(food.image, 'url') else None,
                'restaurant': food.restaurant.name if food.restaurant else 'Nhà hàng',
                'category': food.category.name if food.category else 'Khác'
            })
        return result

    def _handle_contextual_suggestion(self, context_data: Dict[str, str]) -> Dict[str, Any]:
        context = context_data.get('context')
        foods = self._get_contextual_recommendations(context)

        if not foods:
            fallback_text = 'Trời nóng quá, bạn thử nước ép cam, trà đào hoặc sữa chua đá nhé!' if context == 'hot' else 'Trời lạnh mà, mình gợi ý bạn ăn lẩu Thái, súp nóng hoặc đồ nướng nhé!'
            return {
                'type': 'advice',
                'text': fallback_text,
                'suggestions': ['Xem thực đơn', 'Đặt món ngay', 'Tìm món khác']
            }

        if context == 'hot':
            intro = 'Trời nóng thì làm ly mát lạnh cho đã khát nhé. Đây là vài món giải nhiệt bạn có thể thử:'
        else:
            intro = 'Giời se lạnh mình nên thưởng thức vài món ấm bụng, dưới đây là gợi ý ngon lành:'

        detail_lines = [
            f"• {item['name']} ({item['formatted_price']}) - {item['restaurant']}"
            for item in foods
        ]

        return {
            'type': 'food_recommendation',
            'text': f"{intro}\n\n" + "\n".join(detail_lines),
            'metadata': {
                'context': context,
                'recommendations': foods
            },
            'suggestions': ['Đặt ngay món này', 'Xem thêm món khác', 'Xem thực đơn đầy đủ']
        }

    def _show_food_options(self, food_items: List[Dict[str, Any]], quantity: int = 1) -> Dict[str, Any]:
        if not food_items:
            return {
                'type': 'advice',
                'text': 'Xin lỗi, không tìm thấy món ăn phù hợp.',
                'suggestions': ['Xem thực đơn', 'Tìm món khác']
            }
            
        if len(food_items) == 1:
            # If only one result, show details
            food = food_items[0]
            return {
                'type': 'food_item',
                'text': f"{food['name']} - {food['formatted_price']}\n{food['description']}",
                'suggestions': [
                    f"Đặt món {food['name']}",
                    'Xem thực đơn',
                    'Tìm món khác'
                ],
                'metadata': {
                    'food_id': food['id'],
                    'food_name': food['name'],
                    'price': food['price'],
                    'quantity': quantity,
                    'image': food.get('image')
                }
            }
        else:
            # If multiple results, show options
            return {
                'type': 'food_list',
                'text': f'Tìm thấy {len(food_items)} món phù hợp:',
                'items': food_items,
                'suggestions': ['Xem thực đơn', 'Tìm món khác']
            }
    
    def _fetch_food_items(self, query: str = '') -> List[Dict[str, Any]]:
        """Fetch food items from the Django REST API"""
        try:
            url = urljoin(settings.API_BASE_URL, 'foods/')
            params = {'search': query} if query else {}
            
            response = requests.get(url, params=params)
            response.raise_for_status()
            
            return response.json().get('results', [])
            
        except requests.RequestException as e:
            print(f"Error fetching food items: {str(e)}")
            return []
    
    def _format_food_items(self, food_items: List[Dict[str, Any]]) -> str:
        """Format food items into a user-friendly string"""
        if not food_items:
            return "Hiện không có món ăn nào phù hợp."
            
        formatted = []
        for item in food_items:
            price = f"{int(item.get('price', 0)):,}đ" if item.get('price') else 'Liên hệ'
            formatted.append(f"🍽️ {item.get('name', 'Không tên')} - {price}")
            
        return "\n".join(formatted)
    
    def _extract_food_entities(self, text: str) -> Dict[str, Any]:
        """Extract food-related entities from text with enhanced Vietnamese support"""
        entities = {}
        text = self._normalize_text(text).strip()
        
        # Common Vietnamese food prefixes and suffixes
        food_prefixes = ['món', 'đồ', 'món ăn', 'đồ ăn', 'món', 'đồ']
        cooking_styles = ['nướng', 'chiên', 'xào', 'hấp', 'luộc', 'kho', 'rang', 'sốt', 'xốt']
        
        # Common Vietnamese food patterns
        food_patterns = [
            r'(?:món\s+)?(bún\s+\w+)',  # bún bò, bún chả, etc.
            r'(?:món\s+)?(phở\s+\w*)',  # phở bò, phở gà, etc.
            r'(?:món\s+)?(cơm\s+\w*)',  # cơm gà, cơm tấm, etc.
            r'(?:món\s+)?(bánh\s+\w+)', # bánh mì, bánh xèo, etc.
            r'(?:món\s+)?(gà\s+\w*)',   # gà rán, gà nướng, etc.
            r'(?:món\s+)?(heo\s+\w*)',  # thịt heo nướng, sườn heo, etc.
            r'(?:món\s+)?(bò\s+\w*)',   # bò lúc lắc, bò nướng, etc.
            r'(?:món\s+)?(tôm\s+\w*)',  # tôm hấp, tôm nướng, etc.
            r'(?:món\s+)?(cá\s+\w*)',   # cá chiên, cá nướng, etc.
            r'(?:món\s+)?(mực\s+\w*)',  # mực nướng, mực xào, etc.
            r'(?:món\s+)?(cua\s+\w*)',  # cua hấp, cua rang, etc.
            r'(?:món\s+)?(ghẹ\s+\w*)',  # ghẹ hấp, gh nướng, etc.
            r'(?:món\s+)?(ốc\s+\w*)',   # ốc móng tay, ốc hương, etc.
            r'(?:món\s+)?(lẩu\s+\w*)',  # lẩu thái, lẩu hải sản, etc.
            r'(?:món\s+)?(gỏi\s+\w*)',  # gỏi cuốn, gỏi đu đủ, etc.
            r'(?:món\s+)?(chả\s+\w*)',  # chả giò, chả lụa, etc.
            r'(?:món\s+)?(nem\s+\w*)',  # nem nướng, nem chua, etc.
            r'(?:món\s+)?(xôi\s+\w*)',  # xôi gà, xôi mặn, etc.
            r'(?:món\s+)?(chè\s+\w*)',  # chè đậu đen, chè thái, etc.
            r'(?:món\s+)?(bánh\s+\w+)', # bánh mì, bánh xèo, etc.
        ]
        
        # Remove common phrases that might confuse the food name
        remove_phrases = [
            'tôi muốn', 'cho tôi', 'đặt món', 'món', 'cái', 'phần',
            'bạn có', 'bạn ơi', 'làm ơn', 'vui lòng', 'giúp tôi'
        ]
        
        for phrase in remove_phrases:
            text = re.sub(r'\b' + re.escape(phrase) + r'\b', '', text)
        
        # Extract quantity (e.g., 1, 2, 3, một, hai, ba)
        quantity_map = {
            'một': 1, 'mốt': 1, '1': 1, 'một cái': 1, 'một phần': 1, 'một dĩa': 1,
            'hai': 2, '2': 2, 'hai cái': 2, 'hai phần': 2, 'hai dĩa': 2,
            'ba': 3, '3': 3, 'ba cái': 3, 'ba phần': 3, 'ba dĩa': 3,
            'bốn': 4, '4': 4, 'bốn cái': 4, 'bốn phần': 4,
            'năm': 5, '5': 5, 'năm cái': 5, 'năm phần': 5
        }
        
        # Check for quantity patterns
        for word, qty in quantity_map.items():
            if word in text:
                entities['quantity'] = qty
                # Remove the quantity from text to avoid matching it as food name
                text = re.sub(r'\b' + re.escape(word) + r'\b', '', text).strip()
                break
        
        # Try to match food patterns
        for pattern in food_patterns:
            match = re.search(pattern, text)
            if match:
                food_item = match.group(1).strip()
                if len(food_item.split()) > 1:  # Only consider if we have at least 2 words
                    entities['food_item'] = food_item
                    break
        
        # If no pattern matched, try to extract food item by keywords
        if 'food_item' not in entities:
            # Common Vietnamese food words to help identify food items
            food_keywords = [
                'phở', 'bún', 'cơm', 'bánh', 'nước', 'trà', 'cafe', 'cháo', 'lẩu',
                'gà', 'bò', 'heo', 'cá', 'tôm', 'mực', 'cua', 'ghẹ', 'ốc', 'ếch',
                'xôi', 'bánh mì', 'bánh bao', 'bánh cuốn', 'bánh xèo', 'bánh tráng',
                'bánh đa', 'bánh tét', 'bánh chưng', 'bánh giò', 'bánh nếp',
                'bánh tẻ', 'bánh đúc', 'bánh bèo', 'bánh đa', 'bánh trôi', 'bánh chay'
            ]
            
            words = text.split()
            for i, word in enumerate(words):
                if word in food_keywords:
                    # Check if next word is a cooking style or part of the food name
                    food_item = word
                    if i + 1 < len(words) and words[i+1] in cooking_styles:
                        food_item += ' ' + words[i+1]
                    elif i + 1 < len(words) and words[i+1] not in food_prefixes + ['của', 'gì', 'nào', 'không']:
                        food_item += ' ' + words[i+1]
                    
                    entities['food_item'] = food_item.strip()
                    break
        
        # If still no food item found, use the remaining text as food item
        if 'food_item' not in entities and text.strip():
            # Remove any remaining common words
            remaining_text = text.strip()
            for word in food_prefixes + cooking_styles + ['của', 'gì', 'nào', 'không', 'có']:
                remaining_text = re.sub(r'\b' + re.escape(word) + r'\b', '', remaining_text).strip()
            
            if remaining_text:
                entities['food_item'] = remaining_text
        
        return entities
    
    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity between two texts using Jaro-Winkler distance"""
        return jellyfish.jaro_winkler_similarity(text1, text2)
    
    def _find_best_match(self, message: str, intents: List[Dict]) -> Optional[Dict]:
        """Find the best matching intent for the message"""
        best_match = None
        highest_score = 0
        
        for intent in intents:
            for pattern in intent.get('patterns', []):
                # Check for exact match first
                if message == pattern:
                    return {
                        'intent': intent,
                        'score': 1.0,
                        'entity': None
                    }
                
                # Calculate similarity score
                score = self._calculate_similarity(message, pattern)
                
                # Check for pattern with placeholders
                if '%s' in pattern:
                    # Try to extract entity from message
                    pattern_parts = pattern.split('%s')
                    if len(pattern_parts) == 2:
                        if message.startswith(pattern_parts[0]) and message.endswith(pattern_parts[1]):
                            entity = message[len(pattern_parts[0]):-len(pattern_parts[1])].strip()
                            if entity:
                                score = max(score, 0.9)  # Boost score for pattern match
                                if score > highest_score:
                                    highest_score = score
                                    best_match = {
                                        'intent': intent,
                                        'score': score,
                                        'entity': entity
                                    }
                
                # Update best match if score is higher
                if score > highest_score:
                    highest_score = score
                    best_match = {
                        'intent': intent,
                        'score': score,
                        'entity': None
                    }
        
        return best_match if highest_score > 0.6 else None  # Minimum threshold

    def _extract_food_keyword(self, message: str) -> Optional[str]:
        """Extract the main food keyword from the message with priority on ingredients"""
        if not message or not isinstance(message, str):
            return None
            
        # Common Vietnamese ingredients (prioritize these)
        ingredients = [
            'thịt heo', 'thịt lợn', 'heo', 'lợn',
            'thịt bò', 'bò',
            'thịt gà', 'gà',
            'thịt vịt', 'vịt',
            'thịt cừu', 'cừu',
            'thịt dê', 'dê',
            'cá', 'tôm', 'mực', 'cua', 'ghẹ', 'tôm hùm', 'nghêu', 'sò', 'ốc', 'hến',
            'đậu hũ', 'đậu phụ', 'đậu', 'nấm', 'rau', 'củ', 'quả'
        ]
        
        # Common Vietnamese dishes and food items
        common_foods = [
            # Noodle dishes
            'bún bò huế', 'phở bò', 'phở gà', 'bún riêu', 'bún mắm', 'bún đậu mắm tôm',
            'bún chả hà nội', 'phở cuốn', 'bún thang', 'hủ tiếu', 'mì quảng', 'bánh canh',
            # Rice dishes
            'cơm tấm', 'cơm gà', 'cơm chiên', 'cơm rang', 'xôi mặn', 'xôi ngọt', 'xôi gà',
            # Bread and cakes
            'bánh mì', 'bánh xèo', 'bánh cuốn', 'bánh ướt', 'bánh bèo', 'bánh đa', 'bánh khọt',
            'bánh tráng trộn', 'bánh tráng nướng', 'bánh căn', 'bánh đúc', 'bánh đa cua',
            # Meat dishes
            'gà rán', 'gà nướng', 'gà hấp', 'gà quay', 'vịt quay', 'vịt nướng',
            # Hot pot
            'lẩu thái', 'lẩu hải sản', 'lẩu bò', 'lẩu gà', 'lẩu nấm',
            # Salads and rolls
            'gỏi cuốn', 'gỏi đu đủ', 'gỏi ngó sen', 'gỏi sứa', 'gỏi tôm thịt',
            'nem rán', 'nem chua', 'chả giò', 'chả lụa', 'chả cá',
            # Others
            'súp', 'canh', 'mắm', 'dưa muối', 'cà muối'
        ]
        
        # Cooking methods and descriptors
        cooking_methods = ['nướng', 'chiên', 'xào', 'hấp', 'kho', 'rán', 'nấu', 'quay', 'sốt', 'xốt', 'tái', 'chín']
        
        # Common prefixes to ignore
        ignore_prefixes = ['món', 'đồ', 'món ăn', 'đồ ăn', 'phần', 'dĩa', 'tô', 'bát', 'chén']
        
        message_lower = self._normalize_text(message.lower())
        words = message_lower.split()
        
        # 1. First, try to find exact matches in common foods (longest first)
        for food in sorted(common_foods, key=len, reverse=True):
            if food in message_lower:
                # Get the full food phrase including any cooking method that follows
                start_idx = message_lower.find(food)
                end_idx = start_idx + len(food)
                
                # Look for cooking methods after the food name
                remaining_text = message_lower[end_idx:].strip()
                if remaining_text:
                    next_word = remaining_text.split()[0]
                    if next_word in cooking_methods:
                        return f"{food} {next_word}"
                return food
        
        # 2. Look for ingredient + cooking method patterns (e.g., "thịt heo nướng")
        for i, word in enumerate(words):
            if word in ingredients:
                # Check for cooking method after the ingredient
                if i + 1 < len(words) and words[i+1] in cooking_methods:
                    return f"{word} {words[i+1]}"
                # Check for food type before the ingredient (e.g., "thịt heo")
                elif i > 0 and f"{words[i-1]} {word}" in ingredients:
                    if i + 1 < len(words) and words[i+1] in cooking_methods:
                        return f"{words[i-1]} {word} {words[i+1]}"
                    else:
                        return f"{words[i-1]} {word}"
                else:
                    # Just return the ingredient if no cooking method found
                    return word
        
        # 3. If no ingredient found, try to find a cooking method and get the word before it
        for i, word in enumerate(words):
            if word in cooking_methods and i > 0:
                prev_word = words[i-1]
                # Skip if previous word is an ignore prefix
                if prev_word not in ignore_prefixes:
                    return f"{prev_word} {word}"
        
        # 4. Fallback: Return the last non-common word
        for word in reversed(words):
            if (word not in cooking_methods and 
                word not in ignore_prefixes and 
                not any(word in food for food in common_foods)):
                return word
        
        # 5. Last resort: Return the first non-common word
        for word in words:
            if word not in ignore_prefixes:
                return word
                
        return None
        
        
    def _analyze_message(self, message: str) -> Tuple[str, Dict[str, Any]]:
        """Analyze user message to detect intent and extract entities"""
        try:
            if not message or not isinstance(message, str):
                return 'unknown', {}
                
            message = self._normalize_text(message.lower().strip())
            if not message:
                return 'unknown', {}
                
            # First, check if this is a food search query
            food_keyword = self._extract_food_keyword(message)
            if food_keyword:
                return 'find_food', {'food_item': food_keyword, 'original_query': message}
            
            # First, try to find a match in training data
            best_match = self._find_best_match(message, TRAINING_DATA)
            
            if best_match and best_match['score'] > 0.7:  # Good match threshold
                intent_tag = best_match['intent']['tag']
                entities = {}
                
                # Extract entities based on intent
                if intent_tag == 'order_food' and best_match.get('entity'):
                    entities = self._extract_food_entities(best_match['entity'])
                elif intent_tag == 'food_item':
                    entities = self._extract_food_entities(best_match.get('entity', ''))
                
                return intent_tag, entities
            
            # Fall back to rule-based matching for lower confidence cases
            return self._analyze_message_rule_based(message)
            
        except Exception as e:
            print(f"Error in _analyze_message: {str(e)}")
            return 'error', {'error': str(e)}
    
    def _analyze_message_rule_based(self, message: str) -> Tuple[str, Dict[str, Any]]:
        """Rule-based message analysis as a fallback with enhanced Vietnamese support"""
        # Normalize the message for better matching
        message = self._normalize_text(message.lower().strip())
        
        # Check for greetings
        greeting_keywords = [
            'chào', 'xin chào', 'chào bạn', 'chào bot', 'hello', 'hi',
            'chào buổi sáng', 'chào buổi chiều', 'chào buổi tối'
        ]
        if any(re.search(rf'\b{re.escape(g)}\b', message) for g in greeting_keywords):
            return 'greeting', {}
        
        # Enhanced food order patterns with better Vietnamese support
        order_patterns = [
            # Patterns for "I want to order [food]"
            r'(?:tôi\s+muốn|mình\s+muốn|tôi\s+đang\s+muốn|mình\s+đang\+muốn)\s+(?:đặt\s+món|đặt|mua|gọi|order)\s+(?:món\s+)?(.*?)(?:\s+cho\s+tôi|\s+đi|\s+không|\s+nhé|\s+nhỉ|\?|$|\s+nha|\s+nhá)',
            # Patterns for "Give me [food]"
            r'(?:cho\s+tôi|đưa\s+tôi|đem\s+cho\s+tôi|mang\s+cho\s+tôi|giao\s+cho\s+tôi)\s+(?:món\s+)?(.*?)(?:\s+đi|\s+nhé|\s+nhỉ|\?|$|\s+nha|\s+nhá)',
            # Patterns for "[food] please"
            r'^(?!.*(?:tôi|mình|bạn|cho|đặt|mua|gọi|order))(.+?)(?:\s+đi|\s+nhé|\s+nhỉ|\?|$|\s+nha|\s+nhá|\s+cho\s+tôi)',
            # Patterns for "I want [food]"
            r'(?:tôi\s+muốn|mình\s+muốn|tôi\s+thích|mình\s+thích|tôi\s+lấy|mình\s+lấy)\s+(?:món\s+)?(.*?)(?:\s+đi|\s+nhé|\s+nhỉ|\?|$|\s+nha|\s+nhá)'
        ]
        
        for pattern in order_patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                food_phrase = match.group(1).strip()
                if food_phrase:
                    # Clean up common Vietnamese phrases that might be captured
                    food_phrase = re.sub(r'\b(?:một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|\d+)\s*(?:phần|đĩa|dĩa|tô|bát|ly|cốc|chai|lon|hộp)?\b', '', food_phrase).strip()
                    food_phrase = re.sub(r'\b(?:cho|đi|nhé|nhỉ|nha|nhá|tôi|mình|bạn|món|gì|nào|đó|kia|này|đấy)\b', '', food_phrase).strip()
                    
                    if food_phrase:
                        entities = self._extract_food_entities(message)  # Use full message for better context
                        if entities and 'food_item' in entities:
                            return 'order_food', entities
                        return 'order_food', {'food_item': food_phrase}
                return 'ask_food_item', {}
        
        # Enhanced food keywords with common Vietnamese dishes
        food_keywords = [
            # Noodle soups
            'phở', 'pho', 'bún', 'bun', 'hủ tiếu', 'hu tieu', 'bánh canh', 'banh canh',
            # Rice dishes
            'cơm', 'com', 'xôi', 'xoi', 'cơm tấm', 'com tam', 'cơm gà', 'com ga',
            # Bread and cakes
            'bánh mì', 'banh mi', 'bánh bao', 'banh bao', 'bánh xèo', 'banh xeo',
            # Drinks
            'nước', 'nuoc', 'trà', 'tra', 'trà sữa', 'tra sua', 'cà phê', 'ca phe', 'sinh tố', 'sinh to',
            # Common dishes
            'bún bò', 'bun bo', 'phở bò', 'pho bo', 'phở gà', 'pho ga', 'bún chả', 'bun cha',
            'bánh cuốn', 'banh cuon', 'gỏi cuốn', 'goi cuon', 'bún đậu', 'bun dau',
            # Hot pot and steamboat
            'lẩu', 'lau', 'lẩu thái', 'lau thai', 'lẩu hải sản', 'lau hai san',
            # Common proteins
            'thịt', 'thit', 'gà', 'ga', 'vịt', 'vit', 'bò', 'bo', 'heo', 'lợn', 'lon',
            'cá', 'ca', 'tôm', 'tom', 'mực', 'muc', 'cua', 'ghẹ', 'ghe', 'ốc', 'oc'
        ]
        
        # Check for direct food mentions with word boundaries
        for keyword in food_keywords:
            if re.search(rf'\b{re.escape(keyword)}\b', message):
                entities = self._extract_food_entities(message)
                if entities and 'food_item' in entities:
                    return 'order_food', entities
                
                # If no entities found but keyword exists, create a basic entity
                food_match = re.search(rf'\b({keyword}[\w\s]*)\b', message, re.IGNORECASE)
                if food_match:
                    food_name = food_match.group(1).strip()
                    return 'order_food', {'food_item': food_name}
        
        # Enhanced menu queries
        menu_keywords = [
            'thực đơn', 'thuc don', 'menu', 'có món gì', 'co mon gi',
            'món ngon', 'mon ngon', 'đồ ăn', 'do an', 'món ăn', 'mon an',
            'hôm nay có gì', 'hom nay co gi', 'có gì ngon', 'co gi ngon'
        ]
        if any(re.search(rf'\b{re.escape(keyword)}\b', message) for keyword in menu_keywords):
            return 'ask_menu', {'category': 'all'}
        
        # Kiểm tra số đơn hàng trước (ví dụ: Đơn #31, đơn 31, #31)
        order_number_match = re.search(r'(?:đơn|don|#)\s*(\d+)', message, re.IGNORECASE)
        if order_number_match:
            order_number = order_number_match.group(1)
            return 'order_status', {'order_number': order_number}
            
        # Sau đó mới kiểm tra các từ khóa liên quan đến trạng thái đơn hàng
        status_keywords = [
            'trạng thái đơn hàng', 'trang thai don hang', 'đơn hàng', 'don hang',
            'kiểm tra đơn', 'kiem tra don', 'theo dõi đơn', 'theo doi don',
            'đơn của tôi', 'don cua toi', 'đã đặt', 'da dat', 'đặt rồi', 'dat roi',
            'tôi muốn xem', 'toi muon xem', 'cho tôi xem', 'cho toi xem',
            'tình trạng đơn', 'tinh trang don', 'đơn số', 'don so', 'tình trạng', 'tinh trang',
            'xem đơn', 'xem don', 'kiểm tra tình trạng', 'kiem tra tinh trang'
        ]

        if any(keyword in message for keyword in status_keywords):
            # Nếu người dùng hỏi về trạng thái đơn nhưng chưa cung cấp số đơn
            return 'ask_order_number', {}
        
        # Delivery info queries
        delivery_keywords = [
            'phí giao hàng', 'phi giao hang', 'tiền ship', 'tien ship',
            'giá ship', 'gia ship', 'ship bao nhiêu', 'ship bao nhieu',
            'giao hàng', 'giao hang', 'vận chuyển', 'van chuyen',
            'có giao hàng không', 'co giao hang khong', 'giao tận nơi', 'giao tan noi'
        ]
        if any(keyword in message for keyword in delivery_keywords):
            return 'delivery_info', {}
        
        # Payment queries
        payment_keywords = [
            'thanh toán', 'thanh toan', 'trả tiền', 'tra tien',
            'tiền hàng', 'tien hang', 'tiền ship', 'tien ship',
            'cách thanh toán', 'cach thanh toan', 'hình thức thanh toán', 'hinh thuc thanh toan',
            'thanh toán online', 'thanh toan online', 'thanh toán khi nhận hàng', 'thanh toan khi nhan hang',
            'cod', 'chuyển khoản', 'chuyen khoan', 'momo', 'zalo pay', 'zalopay', 'vnpay'
        ]
        if any(keyword in message for keyword in payment_keywords):
            return 'payment_info', {}
        
        # Operating hours queries
        hours_keywords = [
            'mấy giờ mở cửa', 'may gio mo cua', 'mấy giờ đóng cửa', 'may gio dong cua',
            'giờ mở cửa', 'gio mo cua', 'giờ đóng cửa', 'gio dong cua',
            'hoạt động đến mấy giờ', 'hoat dong den may gio', 'bán đến mấy giờ', 'ban den may gio',
            'có bán sáng không', 'co ban sang khong', 'có bán đêm không', 'co ban dem khong'
        ]
        if any(keyword in message for keyword in hours_keywords):
            return 'operating_hours', {}
        
        # Contact information
        contact_keywords = [
            'liên hệ', 'lien he', 'số điện thoại', 'so dien thoai', 'sdt', 'phone',
            'địa chỉ', 'dia chi', 'địa điểm', 'dia diem', 'chỉ đường', 'chi duong',
            'facebook', 'zalo', 'instagram', 'twitter', 'fanpage', 'trang web', 'website'
        ]
        if any(keyword in message for keyword in contact_keywords):
            return 'contact_info', {}
        
        # Thank you messages
        thank_keywords = [
            'cảm ơn', 'cam on', 'cám ơn', 'cam on', 'cảm ơn bạn', 'cam on ban',
            'tốt', 'tot', 'tuyệt vời', 'tuyet voi', 'ngon', 'hài lòng', 'hai long',
            'cảm ơn nhiều', 'cam on nhieu', 'thanks', 'thank you', 'tks', 'thks'
        ]
        if any(keyword in message for keyword in thank_keywords):
            return 'thank_you', {}
        
        # Goodbye messages
        goodbye_keywords = [
            'tạm biệt', 'tam biet', 'bye', 'goodbye', 'see you', 'hẹn gặp lại', 'hen gap lai',
            'thôi về', 'thoi ve', 'ngủ ngon', 'ngu ngon', 'chúc ngủ ngon', 'chuc ngu ngon',
            'tạm biệt nhé', 'tam biet nhe', 'bye bye', 'bái bai', 'pai pai'
        ]
        if any(keyword in message for keyword in goodbye_keywords):
            return 'goodbye', {}
        
        # If no intent matched, check for common questions
        question_words = ['gì', 'gi', 'nào', 'sao', 'không', 'ko', 'chưa', 'chua', 'ai', 'đâu', 'dau', 'tại sao', 'tai sao']
        if any(word in message for word in question_words) or '?' in message:
            return 'ask_question', {}
        
        return 'unknown', {}
    def _get_food_recommendations(self, limit: int = 5) -> List[Dict[str, Any]]:
        """Get personalized food recommendations for the user"""
        if not self.user or not self.user.is_authenticated:
            # Return popular foods for non-authenticated users
            popular_foods = Food.objects.filter(is_available=True).order_by('-order_count')[:limit]
            return [
                {
                    'id': food.id,
                    'name': food.name,
                    'image': food.image.url if food.image else None,
                    'action': {
                        'type': 'suggest_food',
                        'food_id': food.id
                    }
                } for food in popular_foods
            ]
        
        # Get personalized recommendations for authenticated users
        recommendations = FoodRecommendation.objects.filter(
            user=self.user,
            food__is_available=True
        ).select_related('food').order_by('-score')[:limit]
        
        if not recommendations.exists():
            # Fallback to popular foods if no recommendations
            popular_foods = Food.objects.filter(is_available=True).order_by('-order_count')[:limit]
            return [
                {
                    'id': food.id,
                    'name': food.name,
                    'image': food.image.url if food.image else None,
                    'action': {
                        'type': 'suggest_food',
                        'food_id': food.id
                    }
                } for food in popular_foods
            ]
            
        return [
            {
                'id': rec.food.id,
                'name': rec.food.name,
                'image': rec.food.image.url if rec.food.image else None,
                'action': {
                    'type': 'suggest_food',
                    'food_id': rec.food.id
                }
            } for rec in recommendations
        ]
    
    def _get_popular_foods(self, limit: int = 5) -> List[Dict[str, Any]]:
        """Get list of popular food items with enhanced display"""
        try:
            popular_foods = Food.objects.filter(is_available=True).order_by('-order_count')[:limit]
            
            if not popular_foods.exists():
                return []
                
            return [
                {
                    'id': str(food.id),  # Ensure ID is string for consistency
                    'name': food.name,
                    'normalized_name': self._normalize_text(food.name),  # Add normalized name for matching
                    'description': food.description or 'Món ngon hấp dẫn',
                    'price': float(food.price) if food.price else 0,
                    'formatted_price': f"{int(food.price):,}đ" if food.price else 'Liên hệ',
                    'image': food.image.url if food.image and hasattr(food.image, 'url') else None,
                    'category': food.category.name if food.category else 'Khác',
                    'action': {
                        'type': 'suggest_food',
                        'food_id': str(food.id),
                        'food_name': food.name
                    },
                    'suggestions': [
                        f"Đặt món {food.name}",
                        f"Xem chi tiết {food.name}",
                        "Xem thực đơn"
                    ],
                    'restaurant': {
                        'id': food.restaurant.id,
                        'name': food.restaurant.name
                    },
                    'category': food.category.name if food.category else None,
                    'is_available': food.is_available,
                    'average_rating': float(food.average_rating) if food.average_rating else 0.0,
                    'order_count': food.order_count
                } for food in popular_foods
            ]
        except Exception as e:
            print(f"Error in _get_popular_foods: {str(e)}")
            return []
            
    def _handle_order_status(self, entities: Dict[str, Any]) -> Dict[str, Any]:
        """Handle order status inquiries"""
        try:
            order_number = entities.get('order_number')
            
            if not order_number:
                return {
                    'type': 'ask_order_number',
                    'text': 'Vui lòng cung cấp số đơn hàng của bạn (ví dụ: #123 hoặc đơn 123)',
                    'suggestions': ['Đơn #123', 'Đơn #456', 'Đơn #789']
                }
            
            # Try to get the order from the database
            try:
                order = Order.objects.get(id=order_number, user=self.user)
            except Order.DoesNotExist:
                return {
                    'type': 'order_not_found',
                    'text': f'Không tìm thấy đơn hàng #{order_number}. Vui lòng kiểm tra lại số đơn hàng.',
                    'suggestions': ['Kiểm tra lại số đơn', 'Liên hệ hỗ trợ']
                }
            
            # Format order status
            status_map = {
                'pending': 'đang chờ xử lý',
                'confirmed': 'đã xác nhận',
                'preparing': 'đang chuẩn bị',
                'ready': 'sẵn sàng giao hàng',
                'on_delivery': 'đang giao hàng',
                'delivered': 'đã giao hàng',
                'cancelled': 'đã hủy'
            }
            
            status_text = status_map.get(order.status, order.status)
            
            # Format order items
            items = [f"- {item.quantity}x {item.food.name} ({item.food.price:,}đ)" 
                    for item in order.items.all()]
            
            # Format delivery info
            delivery_info = ""
            if order.delivery_address:
                delivery_info = f"\n\n📍 Địa chỉ giao hàng: {order.delivery_address}"
            
            # Format payment info
            payment_info = ""
            if order.payment_method:
                payment_info = f"\n💳 Phương thức thanh toán: {order.get_payment_method_display()}"
            
            return {
                'type': 'order_status',
                'text': (
                    f"🛒 Thông tin đơn hàng #{order.id}\n"
                    f"📅 Ngày đặt: {order.created_at.strftime('%d/%m/%Y %H:%M')}\n"
                    f"📦 Trạng thái: {status_text}\n"
                    f"🍽️ Chi tiết đơn hàng:\n" + "\n".join(items) +
                    f"\n\n💵 Tổng tiền: {order.total_amount:,}đ" +
                    delivery_info +
                    payment_info
                ),
                'metadata': {
                    'order_id': order.id,
                    'status': order.status,
                    'total_amount': float(order.total_amount)
                }
            }
            
        except Exception as e:
            print(f"Error in _handle_order_status: {str(e)}")
            return {
                'type': 'error',
                'text': 'Đã xảy ra lỗi khi kiểm tra trạng thái đơn hàng. Vui lòng thử lại sau.',
                'suggestions': ['Thử lại', 'Liên hệ hỗ trợ']
            }
    
    def _handle_unknown(self, entities: Dict[str, Any] = None) -> Dict[str, Any]:
        """Handle unknown intents with a helpful response"""
        return {
            'type': 'text',
            'text': 'Xin lỗi, tôi chưa hiểu yêu cầu của bạn. Bạn có thể thử nói rõ hơn hoặc chọn một trong các tùy chọn dưới đây:',
            'suggestions': [
                'Xem thực đơn',
                'Đặt món',
                'Hỗ trợ'
            ]
        }
        
    def _handle_food_order(self, entities: Dict[str, Any]) -> Dict[str, Any]:
        """Handle food order intent"""
        try:
            food_name = entities.get('food_item')
            quantity = entities.get('quantity', 1)
            
            # If no food name, ask for clarification
            if not food_name or food_name.strip() == '':
                popular_items = self._get_popular_foods(4)
                suggestions = [item['name'] for item in popular_items] if popular_items else ['Phở bò', 'Bún chả', 'Cơm gà']
                suggestions.append('Xem thực đơn')
                
                return {
                    'type': 'ask_food_item',
                    'text': 'Bạn muốn đặt món gì ạ? Chúng tôi có nhiều món ngon đang chờ bạn lựa chọn!',
                    'suggestions': suggestions,
                    'metadata': {
                        'popular_items': popular_items
                    }
                }
            
            # Search for food in database
            food_results = Food.objects.filter(
                Q(name__icontains=food_name) |
                Q(description__icontains=food_name),
                is_available=True
            )[:5]  # Limit to 5 results
            
            if food_results.exists():
                if food_results.count() == 1:
                    # If only one result, show details
                    food = food_results.first()
                    return {
                        'type': 'food_details',
                        'text': f"{food.name} - {food.price:,}đ\n{food.description}",
                        'food_id': food.id,
                        'suggestions': [
                            f'Đặt {food.name}',
                            'Xem thực đơn',
                            'Hủy đặt món'
                        ],
                        'metadata': {
                            'food_id': food.id,
                            'food_name': food.name,
                            'price': float(food.price),
                            'quantity': quantity
                        }
                    }
                else:
                    # If multiple results, show options
                    return {
                        'type': 'food_options',
                        'text': f'Tìm thấy {food_results.count()} món phù hợp với "{food_name}":',
                        'options': [{
                            'id': food.id,
                            'name': food.name,
                            'price': float(food.price),
                            'image': food.image.url if food.image else None
                        } for food in food_results],
                        'suggestions': ['Xem thực đơn', 'Tìm món khác']
                    }
            else:
                # If no exact match, find similar foods
                similar_foods = Food.objects.filter(
                    name__icontains=food_name[:3],  # Match first 3 characters
                    is_available=True
                ).exclude(id__in=food_results.values_list('id', flat=True))[:3]
                
                if similar_foods.exists():
                    return {
                        'type': 'suggest_food',
                        'text': f'Không tìm thấy món "{food_name}". Bạn có thể tham khảo các món tương tự:',
                        'suggestions': [food.name for food in similar_foods],
                        'metadata': {
                            'similar_foods': [{
                                'id': food.id,
                                'name': food.name,
                                'price': float(food.price)
                            } for food in similar_foods]
                        }
                    }
                else:
                    return {
                        'type': 'food_not_found',
                        'text': f'Xin lỗi, hiện tại chúng tôi chưa phục vụ món "{food_name}".',
                        'suggestions': ['Xem thực đơn', 'Tìm món khác', 'Liên hệ hỗ trợ']
                    }
                    
        except Exception as e:
            print(f"Error in _handle_food_order: {str(e)}")
            return {
                'type': 'error',
                'text': 'Đã xảy ra lỗi khi tìm kiếm món ăn. Vui lòng thử lại sau.',
                'suggestions': ['Thử lại', 'Xem thực đơn', 'Liên hệ hỗ trợ']
            }
    
    def _generate_response(self, intent: str, entities: Dict[str, Any]) -> Dict[str, Any]:
        """Generate response based on intent and entities"""
        try:
            if intent == 'find_food':
                return self._handle_find_food(entities)
            elif intent == 'greeting':
                return self._handle_greeting(entities)
            elif intent == 'goodbye':
                return self._handle_goodbye(entities)
            elif intent == 'menu_inquiry':
                return self._handle_menu_inquiry(entities)
            elif intent == 'order_status':
                return self._handle_order_status(entities)
            elif intent == 'check_order_status':
                # Redirect to order_status intent handler
                return self._handle_order_status(entities)
            elif intent == 'ask_order_number':
                return {
                    'type': 'ask_order_number',
                    'text': 'Vui lòng cung cấp số đơn hàng của bạn (ví dụ: #123 hoặc đơn 123)',
                    'suggestions': ['Đơn #123', 'Đơn #456', 'Đơn #789']
                }
            elif intent == 'food_search':
                return self._handle_food_search(entities)
            elif intent == 'price_inquiry':
                return self._handle_price_inquiry(entities)
            elif intent == 'place_order':
                return self._handle_place_order(entities)
            elif intent == 'help':
                return self._handle_help(entities)
            elif intent == 'thanks':
                return self._handle_thanks(entities)
            elif intent == 'unknown':
                return self._handle_unknown(entities)
            else:
                return self._handle_unknown(entities)
            
        except Exception as e:
            print(f"Error in _generate_response: {str(e)}")
            return {
                'type': 'error',
                'text': 'Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại sau.',
                'suggestions': ['Thử lại', 'Liên hệ hỗ trợ']
            }

# Example usage:
# chatbot = FoodOrderingChatbot(user=request.user)
# response = chatbot.process_message("Tôi muốn đặt 1 phở bò")
# print(response['text'])

# API View example:
# @api_view(['POST'])
# @permission_classes([IsAuthenticated])
# def chat_view(request):
#     message = request.data.get('message', '').strip()
#     session_id = request.data.get('session_id')
#     
#     if not message:
#         return Response({'error': 'Message is required'}, status=400)
#     
#     try:
#         chatbot = FoodOrderingChatbot(user=request.user, session_id=session_id)
#         response = chatbot.process_message(message)
#         return Response(response)
#     except Exception as e:
#         return Response({'error': str(e)}, status=500)

# Export the main class
__all__ = ['FoodOrderingChatbot']
