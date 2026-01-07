import React, { useState, useEffect } from "react"
import { ScrollView, StyleSheet, View, Image } from "react-native"
import { Button, TextInput, Text } from "react-native-paper"
import { PaperSelect } from "react-native-paper-select"
import api, { authAPI } from "../../services/api"
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../context/AuthContext"

export default function RequestRoleScreen() {
  const { user, accessToken } = useAuth()

  // ----- chọn loại đăng ký -----
  const [roleType, setRoleType] = useState({
    text: "",
    value: "",
    list: [
      { _id: "shipper_register", value: "Đăng ký Tài xế" },
      { _id: "restaurant_register", value: "Đăng ký Nhà hàng" },
    ],
    selectedList: [],
    error: "",
  })

  // ----- chọn thành phố -----
  const [city, setCity] = useState({
    text: "",
    value: "",
    list: [
      { _id: "hanoi", value: "Hà Nội" },
      { _id: "hcm", value: "Hồ Chí Minh" },
      { _id: "danang", value: "Đà Nẵng" },
    ],
    selectedList: [],
    error: "",
  })

  // ----- chọn nguồn giới thiệu -----
  const [source, setSource] = useState({
    text: "",
    value: "",
    list: [
      { _id: "facebook", value: "Facebook" },
      { _id: "friend", value: "Bạn bè giới thiệu" },
      { _id: "other", value: "Khác" },
    ],
    selectedList: [],
    error: "",
  })

  // ----- thông tin user -----
  const [lastName, setLastName] = useState(user?.last_name || "")
  const [firstName, setFirstName] = useState(user?.first_name || "")
  const [email, setEmail] = useState(user?.email || "")
  const [phone, setPhone] = useState(user?.phone_number || "")
  const [idNumber, setIdNumber] = useState(user?.id_number || "")
  const [note, setNote] = useState("")
  // Địa chỉ cụ thể
  const [detailAddress, setDetailAddress] = useState("");
  const [loading, setLoading] = useState(false)

  // ----- trạng thái request (admin duyệt) -----
  const [statusMessage, setStatusMessage] = useState("")

  // Ảnh CCCD
  const [frontImage, setFrontImage] = useState(null);
  const [backImage, setBackImage] = useState(null);
  const pickImage = async (setImage) => {
    try {
      // Luôn xin quyền trước khi mở picker
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        alert("Bạn cần cấp quyền truy cập ảnh trong phần Cài đặt của thiết bị!");
        return;
      }
      // Pick a safe mediaTypes value depending on installed expo-image-picker version
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

      const launchOptions = {
        allowsEditing: true,
        quality: 1,
      };
      if (mediaTypesOption) launchOptions.mediaTypes = mediaTypesOption;

      const result = await ImagePicker.launchImageLibraryAsync(launchOptions);
      if (result && (result.canceled === false || result.cancelled === false)) {
        const uri = (result.assets && result.assets[0]?.uri) || result.uri;
        if (uri) setImage(uri);
      }
    } catch (err) {
      alert("Không thể mở album ảnh. Vui lòng kiểm tra lại quyền truy cập ảnh trên thiết bị!");
      console.log("[ImagePicker error]", err);
    }
  };

  // Hàm gửi request
  const handleSubmit = async () => {
    if (!roleType.value) {
      alert("Vui lòng chọn loại đăng ký!");
      return;
    }
    if (!city.value) {
      alert("Vui lòng chọn thành phố!");
      return;
    }
    if (!lastName) {
      alert("Vui lòng nhập họ!");
      return;
    }
    if (!firstName) {
      alert("Vui lòng nhập tên!");
      return;
    }
    if (!email) {
      alert("Vui lòng nhập email!");
      return;
    }
    if (!phone) {
      alert("Vui lòng nhập số điện thoại!");
      return;
    }
    if (!idNumber) {
      alert("Vui lòng nhập số CMND/CCCD!");
      return;
    }
    if (!detailAddress) {
      alert("Vui lòng nhập địa chỉ cụ thể!");
      return;
    }
    if (!frontImage) {
      alert("Vui lòng tải lên ảnh CCCD mặt trước!");
      return;
    }
    if (!backImage) {
      alert("Vui lòng tải lên ảnh CCCD mặt sau!");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      // PaperSelect stores the selected item in selectedList; use _id when available
      const requestType = roleType.selectedList[0]?._id || roleType.value;
      formData.append("request_type", requestType);
      formData.append("full_name", `${lastName} ${firstName}`);
      formData.append("phone", phone);
      // server expects 'city' field (serializer has `city`), send selected display or id
      const cityValue = city.selectedList[0]?.value || city.value || "";
      formData.append("city", cityValue);
      // include detail address inside note so it's not dropped server-side
      const combinedNote = note ? `${note} ${detailAddress ? " - " + detailAddress : ""}` : detailAddress || "";
      formData.append("note", combinedNote);
      formData.append("id_number", idNumber);
      formData.append("ref_source", source.value);
      formData.append("cccd_front", {
        uri: frontImage,
        name: "cccd_front.jpg",
        type: "image/jpeg",
      });
      formData.append("cccd_back", {
        uri: backImage,
        name: "cccd_back.jpg",
        type: "image/jpeg",
      });

      // Let axios / the native layer set the Content-Type (including boundary).
      // Our axios instance already attaches Authorization header via interceptor.
      try {
        await authAPI.requestRole(formData);
      } catch (err) {
        // Fallback to legacy path if server expects different endpoint
        if (err?.response?.status === 404) {
          await api.post("/auth/requests/create/", formData);
        } else {
          throw err;
        }
      }
      alert("Gửi đăng ký thành công, vui lòng chờ admin duyệt!");
      fetchMyRequests();
    } catch (error) {
      console.error(error.response?.data || error.message);
      alert("Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  };
      {/* Upload CCCD mặt trước */}


      <View>
        <Button
          mode="outlined"
          onPress={() => pickImage(setFrontImage)}
          style={{ marginVertical: 8 }}
        >
          Tải lên CCCD mặt trước
        </Button>
        <View style={{ alignItems: "center", marginBottom: 8, minHeight: 130, justifyContent: 'center' }}>
          {frontImage ? (
            <>
              <Text>Ảnh mặt trước:</Text>
              <Image source={{ uri: frontImage }} style={{ width: 200, height: 120, marginTop: 4, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' }} />
            </>
          ) : (
            <Text style={{ color: 'red' }}>Chưa chọn ảnh mặt trước</Text>
          )}
        </View>

        <Button
          mode="outlined"
          onPress={() => pickImage(setBackImage)}
          style={{ marginVertical: 8 }}
        >
          Tải lên CCCD mặt sau
        </Button>
        <View style={{ alignItems: "center", marginBottom: 8, minHeight: 130, justifyContent: 'center' }}>
          {backImage ? (
            <>
              <Text>Ảnh mặt sau:</Text>
              <Image source={{ uri: backImage }} style={{ width: 200, height: 120, marginTop: 4, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' }} />
            </>
          ) : (
            <Text style={{ color: 'red' }}>Chưa chọn ảnh mặt sau</Text>
          )}
        </View>
      </View>

  // Hàm lấy danh sách request của user (để biết admin đã duyệt chưa)
  const fetchMyRequests = async () => {
    try {
      const res = await authAPI.getMyRequests()
      const list = res?.results || res || []
      if (Array.isArray(list) && list.length > 0) {
        const latest = list[0]
        setStatusMessage(
          `Trạng thái yêu cầu: ${String(latest.status || '').toUpperCase()}${latest.admin_note ? " - " + latest.admin_note : ""}`
        )
      }
    } catch (err) {
      console.error(err?.response?.data || err?.message || err)
    }
  }

  // load trạng thái khi mở màn hình
  useEffect(() => {
    fetchMyRequests()
  }, [])

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Điền thông tin để đăng ký</Text>

      <PaperSelect
        label="Chọn loại đăng ký"
        value={roleType.selectedList[0]?.value || roleType.value || ""}
        onSelection={(val) => {
          const selected = val.selectedList[0]?.value || "";
          setRoleType({
            ...roleType,
            value: selected,
            text: selected,
            selectedList: val.selectedList,
            error: "",
          });
        }}
        arrayList={roleType.list}
        selectedArrayList={roleType.selectedList}
        errorText={roleType.error}
      />
      {roleType.value ? (
        <Text style={{ color: '#FF6B35', marginBottom: 8 }}>Đã chọn: {roleType.value}</Text>
      ) : null}

      <PaperSelect
        label="Chọn thành phố"
        value={city.selectedList[0]?.value || city.value || ""}
        onSelection={(val) => {
          const selected = val.selectedList[0]?.value || "";
          setCity({
            ...city,
            value: selected,
            text: selected,
            selectedList: val.selectedList,
            error: "",
          });
        }}
        arrayList={city.list}
        selectedArrayList={city.selectedList}
        errorText={city.error}
      />
      {city.value ? (
        <Text style={{ color: '#FF6B35', marginBottom: 8 }}>Đã chọn: {city.value}</Text>
      ) : null}

      <TextInput
        label="Họ"
        value={lastName}
        onChangeText={setLastName}
        style={styles.input}
        mode="outlined"
      />
      <TextInput
        label="Tên"
        value={firstName}
        onChangeText={setFirstName}
        style={styles.input}
        mode="outlined"
      />
      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        mode="outlined"
      />
      <TextInput
        label="Số điện thoại"
        value={phone}
        onChangeText={setPhone}
        style={styles.input}
        mode="outlined"
      />
      <TextInput
        label="CMND/CCCD"
        value={idNumber}
        onChangeText={setIdNumber}
        style={styles.input}
        mode="outlined"
      />

      <PaperSelect
        label="Nguồn giới thiệu"
        value={source.selectedList[0]?.value || source.value || ""}
        onSelection={(val) => {
          const selected = val.selectedList[0]?.value || "";
          setSource({
            ...source,
            value: selected,
            text: selected,
            selectedList: val.selectedList,
            error: "",
          });
        }}
        arrayList={source.list}
        selectedArrayList={source.selectedList}
        errorText={source.error}
      />
      {source.value ? (
        <Text style={{ color: '#FF6B35', marginBottom: 8 }}>Đã chọn: {source.value}</Text>
      ) : null}


      <TextInput
        label="Địa chỉ cụ thể (số nhà, đường, phường/xã, quận/huyện)"
        value={detailAddress}
        onChangeText={setDetailAddress}
        style={styles.input}
        mode="outlined"
      />

      <TextInput
        label="Ghi chú"
        value={note}
        onChangeText={setNote}
        style={styles.input}
        mode="outlined"
        multiline
      />

      {/* Upload CCCD mặt trước */}
      <Button
        mode="outlined"
        onPress={() => pickImage(setFrontImage)}
        style={{ marginVertical: 8 }}
      >
        Tải lên CCCD mặt trước
      </Button>
      {frontImage && (
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <Text>Ảnh mặt trước:</Text>
          <Image source={{ uri: frontImage }} style={{ width: 200, height: 120, marginTop: 4 }} />
        </View>
      )}

      {/* Upload CCCD mặt sau */}
      <Button
        mode="outlined"
        onPress={() => pickImage(setBackImage)}
        style={{ marginVertical: 8 }}
      >
        Tải lên CCCD mặt sau
      </Button>
      {backImage && (
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <Text>Ảnh mặt sau:</Text>
          <Image source={{ uri: backImage }} style={{ width: 200, height: 120, marginTop: 4 }} />
        </View>
      )}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={loading}
        style={styles.button}
      >
        Gửi đăng ký
      </Button>

      {statusMessage ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: {
    fontSize: 18,
    marginBottom: 16,
    textAlign: "center",
    fontWeight: "bold",
  },
  input: { marginBottom: 12 },
  button: { marginTop: 20, backgroundColor: "#FF6B35" },
  statusBox: {
    marginTop: 20,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
})
