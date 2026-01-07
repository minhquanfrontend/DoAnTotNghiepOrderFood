// src/screens/account/MyRequestsScreen.js
import React, { useState, useEffect } from "react";
import { ScrollView, Alert, Image, View, ActivityIndicator } from "react-native";
import { Button, TextInput, Text } from "react-native-paper";
import { PaperSelect } from "react-native-paper-select";
import * as ImagePicker from "expo-image-picker";

import { useAuth } from "../../context/AuthContext";
import api, { authAPI } from "../../services/api";

export default function MyRequestsScreen() {
  const { accessToken } = useAuth();

  // Form state
  const [form, setForm] = useState({
    role: null,
    city: null,
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    cccd: "",
    note: "",
  });

  // PaperSelect state
  const [roleSelect, setRoleSelect] = useState({
    value: "",
    list: [
      { _id: "1", value: "shipper" },
      { _id: "2", value: "restaurant" },
    ],
    selectedList: [],
    error: "",
  });

  const [citySelect, setCitySelect] = useState({
    value: "",
    list: [
      { _id: "1", value: "Hà Nội" },
      { _id: "2", value: "TP.HCM" },
    ],
    selectedList: [],
    error: "",
  });

  // Image state
  const [frontImage, setFrontImage] = useState(null);
  const [backImage, setBackImage] = useState(null);

  // Requests state
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pick image from gallery
  const pickImage = async (setImage) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        alert("Bạn cần cấp quyền truy cập ảnh trong phần Cài đặt của thiết bị!");
        return;
      }

      let mediaTypesOption;
      try {
        if (ImagePicker.MediaType && ImagePicker.MediaType.Images) {
          mediaTypesOption = ImagePicker.MediaType.Images;
        } else if (ImagePicker.MediaType) {
              mediaTypesOption = ImagePicker.MediaType.Images;
            } else if (ImagePicker.MediaType) {
              mediaTypesOption = ImagePicker.MediaType.Images;
            } else if (ImagePicker.MediaTypeOptions && ImagePicker.MediaTypeOptions.Images) {
              mediaTypesOption = ImagePicker.MediaTypeOptions.Images;
            }
      } catch (e) {
        mediaTypesOption = undefined;
      }

      const launchOptions = { allowsEditing: true, quality: 1 };
      if (mediaTypesOption) launchOptions.mediaTypes = mediaTypesOption;

      const result = await ImagePicker.launchImageLibraryAsync(launchOptions);
      if (result && (result.canceled === false || result.cancelled === false)) {
        const uri = (result.assets && result.assets[0]?.uri) || result.uri;
        if (uri) setImage(uri);
      }
    } catch (err) {
      console.log("[ImagePicker error]", err);
      alert("Không thể mở album ảnh. Vui lòng kiểm tra lại quyền truy cập ảnh trên thiết bị!");
    }
  };

  // Fetch my requests
  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await authAPI.getMyRequests();
      const list = res?.results || res || []
      setRequests(Array.isArray(list) ? list : []);
    } catch (err) {
      console.log("❌ Lỗi load requests:", err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // Validate email / phone
  const isValidEmail = (email) => /\S+@\S+\.\S+/.test(email);
  const isValidPhone = (phone) => /^[0-9]{9,11}$/.test(phone);

  // Handle submit
  const handleSubmit = async () => {
    if (
      !form.role ||
      !form.city ||
      !form.first_name ||
      !form.last_name ||
      !form.email ||
      !form.phone ||
      !form.cccd ||
      !frontImage ||
      !backImage
    ) {
      Alert.alert("⚠️ Thiếu thông tin", "Vui lòng nhập đầy đủ và tải lên CCCD!");
      return;
    }

    if (!isValidEmail(form.email)) {
      Alert.alert("⚠️ Lỗi", "Email không hợp lệ!");
      return;
    }

    if (!isValidPhone(form.phone)) {
      Alert.alert("⚠️ Lỗi", "Số điện thoại không hợp lệ!");
      return;
    }

    const data = new FormData();

    // append các trường text
    Object.keys(form).forEach((key) => {
      if (form[key]) data.append(key, form[key]);
    });

    // append loại đăng ký (shipper / restaurant)
    data.append("request_type", form.role);

    // append file ảnh
    data.append("cccd_front", {
      uri: frontImage,
      name: "cccd_front.jpg",
      type: "image/jpeg",
    });
    data.append("cccd_back", {
      uri: backImage,
      name: "cccd_back.jpg",
      type: "image/jpeg",
    });

    setSubmitting(true);
    try {
      try {
        await authAPI.requestRole(data);
      } catch (err) {
        if (err?.response?.status === 404) {
          await api.post("/auth/requests/create/", data);
        } else {
          throw err;
        }
      }
      Alert.alert("✅ Thành công", "Yêu cầu đã được gửi, chờ admin duyệt.");
      fetchRequests();
    } catch (err) {
      console.log("❌ Lỗi gửi request:", err.response?.data || err.message);
      Alert.alert("❌ Lỗi", "Không thể gửi yêu cầu, thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={{ padding: 16 }}>
      <Text variant="titleLarge" style={{ marginBottom: 16 }}>
        Điền thông tin để đăng ký
      </Text>

      {/* Chọn loại đăng ký */}
      <PaperSelect
        label="Chọn loại đăng ký"
        value={roleSelect.selectedList[0]?.value || roleSelect.value || ""}
        onSelection={(val) => {
          const selected = val.selectedList[0]?.value || "";
          setRoleSelect({
            ...roleSelect,
            value: selected,
            selectedList: val.selectedList,
            error: "",
          });
          setForm({ ...form, role: selected });
        }}
        arrayList={roleSelect.list}
        selectedArrayList={roleSelect.selectedList}
        errorText={roleSelect.error}
      />
      {/* Hiển thị loại đăng ký đã chọn */}
      {form.role ? (
        <Text style={{ color: '#FF6B35', marginBottom: 8 }}>Đã chọn: {form.role}</Text>
      ) : null}

      {/* Chọn thành phố */}
      <PaperSelect
        label="Chọn thành phố"
        value={citySelect.selectedList[0]?.value || citySelect.value || ""}
        onSelection={(val) => {
          const selected = val.selectedList[0]?.value || "";
          setCitySelect({
            ...citySelect,
            value: selected,
            selectedList: val.selectedList,
            error: "",
          });
          setForm({ ...form, city: selected });
        }}
        arrayList={citySelect.list}
        selectedArrayList={citySelect.selectedList}
        errorText={citySelect.error}
      />
      {/* Hiển thị thành phố đã chọn */}
      {form.city ? (
        <Text style={{ color: '#FF6B35', marginBottom: 8 }}>Đã chọn: {form.city}</Text>
      ) : null}

      {/* Các input */}
      <TextInput
        label="Họ"
        value={form.last_name}
        onChangeText={(t) => setForm({ ...form, last_name: t })}
        style={{ marginVertical: 8 }}
      />
      <TextInput
        label="Tên"
        value={form.first_name}
        onChangeText={(t) => setForm({ ...form, first_name: t })}
        style={{ marginVertical: 8 }}
      />
      <TextInput
        label="Email"
        value={form.email}
        keyboardType="email-address"
        onChangeText={(t) => setForm({ ...form, email: t })}
        style={{ marginVertical: 8 }}
      />
      <TextInput
        label="SĐT"
        value={form.phone}
        keyboardType="phone-pad"
        onChangeText={(t) => setForm({ ...form, phone: t })}
        style={{ marginVertical: 8 }}
      />
      <TextInput
        label="CMND/CCCD"
        value={form.cccd}
        keyboardType="numeric"
        onChangeText={(t) => setForm({ ...form, cccd: t })}
        style={{ marginVertical: 8 }}
      />

      {/* Upload CCCD mặt trước */}
      <Button
        mode="outlined"
        onPress={() => pickImage(setFrontImage)}
        style={{ marginVertical: 8 }}
      >
        Upload CCCD mặt trước
      </Button>
      {frontImage && (
        <Image
          source={{ uri: frontImage }}
          style={{ width: "100%", height: 200, marginBottom: 8 }}
        />
      )}

      {/* Upload CCCD mặt sau */}
      <Button
        mode="outlined"
        onPress={() => pickImage(setBackImage)}
        style={{ marginVertical: 8 }}
      >
        Upload CCCD mặt sau
      </Button>
      {backImage && (
        <Image
          source={{ uri: backImage }}
          style={{ width: "100%", height: 200, marginBottom: 8 }}
        />
      )}

      <TextInput
        label="Ghi chú"
        value={form.note}
        onChangeText={(t) => setForm({ ...form, note: t })}
        style={{ marginVertical: 8 }}
      />

      {/* Submit */}
      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        style={{ marginVertical: 16 }}
      >
        {submitting ? "Đang gửi..." : "Gửi đăng ký"}
      </Button>

      {/* Danh sách yêu cầu */}
      <View style={{ marginTop: 20 }}>
        <Text variant="titleMedium" style={{ marginBottom: 8 }}>
          Danh sách yêu cầu đã gửi
        </Text>
        {loading ? (
          <ActivityIndicator size="large" />
        ) : requests.length === 0 ? (
          <Text>Chưa có yêu cầu nào.</Text>
        ) : (
          requests.map((req) => (
            <View
              key={req.id}
              style={{
                borderWidth: 1,
                borderRadius: 6,
                padding: 8,
                marginVertical: 6,
                borderColor: "#ccc",
              }}
            >
              <Text>Loại: {req.request_type}</Text>
              <Text>
                Trạng thái:{" "}
                {req.status === "pending"
                  ? "⏳ Chờ duyệt"
                  : req.status === "approved"
                  ? "✅ Đã duyệt"
                  : "❌ Bị từ chối"}
              </Text>
              <Text>
                Ngày gửi: {new Date(req.created_at).toLocaleString()}
              </Text>
              {req.admin_note && (
                <Text>Ghi chú từ admin: {req.admin_note}</Text>
              )}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
