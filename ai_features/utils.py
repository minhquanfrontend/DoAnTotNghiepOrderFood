import json
import os
import difflib

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "qa_dataset.json")

def load_qa_dataset():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def find_answer(user_message: str) -> str:
    dataset = load_qa_dataset()
    questions = [item["question"] for item in dataset]

    # 🔹 Tìm câu hỏi gần giống nhất
    closest_match = difflib.get_close_matches(user_message.lower(), questions, n=1, cutoff=0.5)

    if closest_match:
        for item in dataset:
            if item["question"] == closest_match[0]:
                return item["answer"]

    # 🔹 Nếu không tìm thấy -> fallback
    return "Xin lỗi, tôi chưa có câu trả lời phù hợp. Bạn có thể hỏi món khác không?"
