import os
import json
import fasttext
import re
from typing import List, Dict, Any, Optional
from sklearn.model_selection import train_test_split
import numpy as np
import jellyfish
from django.conf import settings
from .models import Food, Category

class IntentClassifier:
    """Improved intent classification using FastText"""
    
    def __init__(self, model_path=None):
        self.model = None
        self.labels = []
        self.model_path = model_path or os.path.join(
            os.path.dirname(__file__), 'models', 'intent_model.bin'
        )
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
    
    def preprocess_text(self, text: str) -> str:
        """Normalize and clean Vietnamese text"""
        # Convert to lowercase and normalize unicode
        text = text.lower().strip()
        text = unicodedata.normalize('NFC', text)
        
        # Remove special characters but keep Vietnamese characters and numbers
        text = re.sub(r'[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\d]', ' ', text)
        return ' '.join(text.split())
    
    def prepare_data(self, training_data: List[Dict]) -> List[str]:
        """Convert training data to FastText format"""
        output = []
        for intent in training_data:
            label = f"__label__{intent['tag']}"
            if intent['tag'] not in self.labels:
                self.labels.append(intent['tag'])
            for pattern in intent['patterns']:
                processed = self.preprocess_text(pattern)
                output.append(f"{label} {processed}")
        return output
    
    def train(self, training_data: List[Dict], test_size: float = 0.2):
        """Train the intent classification model"""
        # Prepare data
        data = self.prepare_data(training_data)
        
        # Split train/test
        train_data, test_data = train_test_split(data, test_size=test_size)
        
        # Save to temp files
        train_path = os.path.join(os.path.dirname(self.model_path), 'fasttext_train.txt')
        test_path = os.path.join(os.path.dirname(self.model_path), 'fasttext_test.txt')
        
        with open(train_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(train_data))
        
        with open(test_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(test_data))
        
        # Train model with optimized parameters for Vietnamese
        self.model = fasttext.train_supervised(
            input=train_path,
            lr=0.5,
            epoch=30,
            wordNgrams=2,
            dim=100,
            minCount=1,
            loss='hs',  # Hierarchical softmax for better performance
            thread=4
        )
        
        # Save model
        self.model.save_model(self.model_path)
        
        # Evaluate
        result = self.model.test(test_path)
        print(f"Model trained with {result[1]*100:.2f}% accuracy on test set")
        
        return self.model
    
    def load_model(self):
        """Load pre-trained model"""
        if os.path.exists(self.model_path):
            self.model = fasttext.load_model(self.model_path)
            # Extract labels from model
            self.labels = [label[9:] for label in self.model.get_labels()]  # Remove __label__ prefix
        else:
            raise FileNotFoundError(f"Model not found at {self.model_path}")
    
    def predict(self, text: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Predict intent with confidence scores"""
        if not self.model:
            self.load_model()
            
        processed_text = self.preprocess_text(text)
        predictions = self.model.predict(processed_text, k=top_k)
        
        return [
            {"intent": label.replace("__label__", ""), 
             "confidence": float(score)}
            for label, score in zip(*predictions)
        ]


class FoodEntityRecognizer:
    """Enhanced entity recognition for food items and quantities"""
    
    def __init__(self):
        self.quantity_units = {
            'phần': 1, 'suất': 1, 'đĩa': 1, 'tô': 1, 'bát': 1,
            'ly': 1, 'cốc': 1, 'hộp': 1, 'phát': 1, 'miếng': 1,
            'con': 1, 'quả': 1, 'trái': 1, 'cái': 1, 'chiếc': 1
        }
        
        self.vn_numbers = {
            'một': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'năm': 5,
            'sáu': 6, 'bảy': 7, 'tám': 8, 'chín': 9, 'mười': 10,
            'mấy': 2, 'vài': 2
        }
        
        self.cooking_styles = [
            'xào', 'chiên', 'nướng', 'hấp', 'luộc', 'kho', 'sốt', 'rang',
            'xào lăn', 'xào tỏi', 'xào bơ', 'xào dòn', 'xào cay', 'chiên giòn',
            'nướng mỡ chài', 'nướng than', 'hấp sả', 'kho tộ', 'kho tiêu',
            'sốt me', 'sốt cà chua', 'sốt bơ tỏi', 'sốt phô mai'
        ]
        
        # Preload food items from database
        self.food_keywords = self._load_food_keywords()
    
    def _load_food_keywords(self) -> List[str]:
        """Load food names from database"""
        try:
            return list(Food.objects.values_list('name', flat=True))
        except Exception as e:
            print(f"Error loading food keywords: {e}")
            return ["phở", "bún", "bánh mì", "cơm", "gà", "bò", "heo", "cá", "tôm"]
    
    def _extract_quantity(self, text: str) -> tuple:
        """Extract quantity from text"""
        # Match numeric quantities (e.g., "2 phần", "3 cái")
        num_match = re.search(r'(\d+)\s*(' + '|'.join(self.quantity_units.keys()) + ')?', text)
        if num_match:
            qty = int(num_match.group(1))
            return qty, num_match.end()
        
        # Match Vietnamese word numbers
        for vn_num, value in self.vn_numbers.items():
            if text.startswith(vn_num):
                return value, len(vn_num)
        
        # Default to 1 if no quantity specified
        return 1, 0
    
    def _extract_cooking_style(self, text: str) -> tuple:
        """Extract cooking style from text"""
        for style in sorted(self.cooking_styles, key=len, reverse=True):
            if style in text:
                return style, text.find(style), len(style)
        return None, -1, 0
    
    def extract_food_entities(self, text: str) -> List[Dict]:
        """Extract food entities with improved accuracy"""
        entities = []
        text_lower = text.lower()
        
        # First, try exact matches
        for food in sorted(self.food_keywords, key=len, reverse=True):
            food_lower = food.lower()
            if food_lower in text_lower:
                start_pos = text_lower.find(food_lower)
                end_pos = start_pos + len(food_lower)
                
                # Extract quantity
                prefix = text_lower[:start_pos].strip()
                quantity, qty_end = self._extract_quantity(prefix)
                
                # Extract cooking style (before food name)
                style, style_start, style_len = self._extract_cooking_style(prefix)
                
                # If no style before food, check after
                if not style:
                    suffix = text_lower[end_pos:].strip()
                    style, style_start, style_len = self._extract_cooking_style(suffix)
                
                entities.append({
                    'food': food,
                    'quantity': quantity,
                    'style': style,
                    'confidence': 1.0  # Exact match
                })
                
                # Remove matched part to avoid duplicates
                text_lower = text_lower[:start_pos] + ' ' + text_lower[end_pos:]
        
        # If no exact matches, try fuzzy matching
        if not entities:
            for food in self.food_keywords:
                # Use Jaro-Winkler distance for fuzzy matching
                similarity = jellyfish.jaro_winkler(text_lower, food.lower())
                if similarity > 0.85:  # Threshold for fuzzy match
                    entities.append({
                        'food': food,
                        'quantity': 1,
                        'style': None,
                        'confidence': similarity
                    })
        
        # Sort by confidence and position
        entities.sort(key=lambda x: (-x['confidence'], x['quantity']))
        return entities


class EnhancedFoodOrderingChatbot:
    """Enhanced food ordering chatbot with improved NLP"""
    
    def __init__(self, user=None, session_id=None):
        self.user = user
        self.session_id = session_id or str(uuid.uuid4())
        self.context = {}
        
        # Initialize components
        self.intent_classifier = IntentClassifier()
        self.entity_recognizer = FoodEntityRecognizer()
        
        # Load models
        self._initialize_models()
    
    def _initialize_models(self):
        """Initialize and load ML models"""
        try:
            # Load intent classifier
            self.intent_classifier.load_model()
            
            # Load training data for retraining if needed
            self.training_data = self._load_training_data()
            
        except Exception as e:
            print(f"Error initializing models: {e}")
            # Fallback to training if model not found
            self.retrain_models()
    
    def _load_training_data(self) -> List[Dict]:
        """Load training data from JSON file"""
        training_file = os.path.join(
            os.path.dirname(__file__), 'data', 'training_data.json'
        )
        try:
            with open(training_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('intents', [])
        except Exception as e:
            print(f"Error loading training data: {e}")
            return []
    
    def retrain_models(self):
        """Retrain the intent classification model"""
        if not self.training_data:
            print("No training data available")
            return
            
        print("Retraining intent classification model...")
        self.intent_classifier.train(self.training_data)
    
    def process_message(self, message: str) -> Dict[str, Any]:
        """Process incoming message and generate response"""
        if not message.strip():
            return self._get_response("Xin lỗi, tôi không nghe rõ. Bạn có thể nói lại được không ạ?")
        
        # Step 1: Classify intent
        try:
            intent_preds = self.intent_classifier.predict(message)
            intent = intent_preds[0]  # Get top intent
            
            # Step 2: Extract entities
            entities = self.entity_recognizer.extract_food_entities(message)
            
            # Step 3: Handle based on intent and entities
            response = self._handle_intent(intent, entities, message)
            
            return self._get_response(response)
            
        except Exception as e:
            print(f"Error processing message: {e}")
            return self._get_response("Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau ạ.")
    
    def _handle_intent(self, intent: Dict, entities: List[Dict], message: str) -> str:
        """Handle message based on detected intent"""
        intent_type = intent['intent']
        confidence = intent['confidence']
        
        # High confidence threshold for critical actions
        if confidence < 0.6 and intent_type not in ['greeting', 'goodbye']:
            return "Xin lỗi, tôi chưa hiểu rõ ý của bạn. Bạn có thể nói rõ hơn được không ạ?"
        
        # Route to appropriate handler
        if intent_type == 'greeting':
            return self._handle_greeting()
        elif intent_type == 'order_food':
            return self._handle_food_order(entities, message)
        elif intent_type == 'menu':
            return self._handle_menu_request()
        elif intent_type == 'delivery':
            return self._handle_delivery_info()
        elif intent_type == 'payment':
            return self._handle_payment_info()
        else:
            return self._handle_unknown_intent()
    
    def _handle_greeting(self) -> str:
        """Handle greeting intent"""
        greetings = [
            "Xin chào! Tôi có thể giúp gì cho bạn hôm nay ạ?",
            "Chào bạn! Bạn muốn đặt món gì ạ?",
            "Xin chào! Hôm nay bạn thế nào? Tôi có thể giúp gì cho bạn?"
        ]
        return random.choice(greetings)
    
    def _handle_food_order(self, entities: List[Dict], message: str) -> str:
        """Handle food order intent"""
        if not entities:
            return "Bạn muốn đặt món gì ạ?"
        
        # Process each food item
        order_items = []
        for entity in entities[:5]:  # Limit to 5 items to avoid too long response
            food_name = entity['food']
            quantity = entity['quantity']
            style = f" {entity['style']} " if entity['style'] else " "
            
            # Try to get food details from database
            try:
                food = Food.objects.filter(name__iexact=food_name).first()
                if food:
                    price = food.price * quantity
                    order_items.append(f"- {quantity} {style}{food_name}: {price:,.0f}đ")
                else:
                    order_items.append(f"- {quantity} {style}{food_name}")
            except Exception as e:
                print(f"Error fetching food details: {e}")
                order_items.append(f"- {quantity} {style}{food_name}")
        
        # Format response
        if order_items:
            items_text = "\n".join(order_items)
            return (
                f"Tôi đã ghi nhận đơn hàng của bạn:\n"
                f"{items_text}\n\n"
                f"Bạn có muốn thêm món gì nữa không ạ?"
            )
        else:
            return "Xin lỗi, tôi chưa hiểu rõ món bạn muốn đặt. Bạn có thể nói rõ hơn được không ạ?"
    
    def _handle_menu_request(self) -> str:
        """Handle menu inquiry"""
        try:
            categories = Category.objects.prefetch_related('food_set').all()
            if not categories.exists():
                return "Hiện tại cửa hàng chưa có thực đơn ạ."
            
            response = ["Thực đơn của chúng tôi gồm có:"]
            for category in categories:
                foods = category.food_set.all()
                if foods.exists():
                    food_list = ", ".join([f"{food.name} ({food.price:,.0f}đ)" for food in foods])
                    response.append(f"\n* {category.name}: {food_list}")
            
            return "\n".join(response)
            
        except Exception as e:
            print(f"Error fetching menu: {e}")
            return "Xin lỗi, hiện không thể tải thực đơn. Vui lòng thử lại sau ạ."
    
    def _handle_delivery_info(self) -> str:
        """Provide delivery information"""
        return (
            "Thông tin giao hàng:\n"
            "- Phí giao hàng: 15,000đ (Miễn phí đơn từ 50,000đ)\n"
            "- Thời gian giao hàng: 30-45 phút\n"
            "- Khu vực giao hàng: Nội thành Hà Nội"
        )
    
    def _handle_payment_info(self) -> str:
        """Provide payment information"""
        return (
            "Chúng tôi chấp nhận các hình thức thanh toán sau:\n"
            "- Tiền mặt khi nhận hàng\n"
            "- Chuyển khoản ngân hàng\n"
            "- Ví điện tử (Momo, ZaloPay, VNPay)"
        )
    
    def _handle_unknown_intent(self) -> str:
        """Handle unknown or low-confidence intents"""
        responses = [
            "Xin lỗi, tôi chưa hiểu ý của bạn. Bạn có thể nói rõ hơn được không ạ?",
            "Tôi chưa hiểu câu hỏi của bạn. Bạn có thể diễn đạt lại được không?",
            "Xin lỗi, tôi chưa được huấn luyện để trả lời câu hỏi này."
        ]
        return random.choice(responses)
    
    def _get_response(self, text: str) -> Dict[str, Any]:
        """Format final response"""
        return {
            'text': text,
            'session_id': self.session_id,
            'timestamp': timezone.now().isoformat()
        }


# Helper function to normalize Vietnamese text
def normalize_vietnamese(text: str) -> str:
    """Normalize Vietnamese text by removing diacritics"""
    if not text:
        return ""
    
    # Convert to lowercase and normalize unicode
    text = text.lower().strip()
    text = unicodedata.normalize('NFC', text)
    
    # Replace common Vietnamese variations
    replacements = {
        'òa': 'oà', 'óa': 'oá', 'ỏa': 'oả', 'õa': 'oã', 'ọa': 'oạ',
        'òe': 'oè', 'óe': 'oé', 'ỏe': 'oẻ', 'õe': 'oẽ', 'ọe': 'oẹ',
        'ùy': 'uỳ', 'úy': 'uý', 'ủy': 'uỷ', 'ũy': 'uỹ', 'ụy': 'uỵ',
        'ùi': 'uì', 'úi': 'uí', 'ủi': 'uỉ', 'ũi': 'uĩ', 'ụi': 'uị',
        'd': 'đ', 'gi': 'd', 'r': 'd', 'ch': 'tr', 'ng': 'ng', 'nh': 'nh',
        'kh': 'kh', 'ph': 'ph', 'th': 'th', 'tr': 'tr', 'ngh': 'ngh'
    }
    
    for old, new in replacements.items():
        text = text.replace(old, new)
    
    return text
