import os
import json
import argparse
from .enhanced_chatbot import IntentClassifier, normalize_vietnamese

def load_training_data(data_path):
    """Load training data from JSON file"""
    with open(data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data.get('intents', [])

def train_model(data_path, model_dir):
    """Train and save the intent classification model"""
    # Create output directory if it doesn't exist
    os.makedirs(model_dir, exist_ok=True)
    
    # Load training data
    training_data = load_training_data(data_path)
    print(f"Loaded {len(training_data)} intents from {data_path}")
    
    # Initialize and train the classifier
    classifier = IntentClassifier()
    print("Training model...")
    classifier.train(training_data)
    
    print(f"Model training completed and saved to {classifier.model_path}")
    return classifier

def test_model(classifier, test_phrases):
    """Test the trained model with sample phrases"""
    print("\nTesting model with sample phrases:")
    for phrase in test_phrases:
        predictions = classifier.predict(phrase)
        print(f"\nPhrase: {phrase}")
        for pred in predictions:
            print(f"  - {pred['intent']}: {pred['confidence']:.2f}")

if __name__ == "__main__":
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Train and test the chatbot model')
    parser.add_argument('--data', type=str, default='data/training_data.json',
                        help='Path to training data JSON file')
    parser.add_argument('--model-dir', type=str, default='models',
                        help='Directory to save the trained model')
    args = parser.parse_args()
    
    # Train the model
    classifier = train_model(args.data, args.model_dir)
    
    # Test with some sample phrases
    test_phrases = [
        "Xin chào",
        "Tôi muốn đặt món phở bò",
        "Có gì ngon hôm nay?",
        "Tôi muốn thanh toán",
        "Có ship không?",
        "Đặt giúp tôi 2 phần bún chả"
    ]
    test_model(classifier, test_phrases)
