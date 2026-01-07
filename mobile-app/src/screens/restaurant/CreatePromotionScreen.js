import React, { useState } from 'react';
import { View, Image, Alert } from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import API from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';

export default function CreatePromotionScreen({ navigation }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền bị từ chối', 'Bạn cần cấp quyền truy cập ảnh');
        return;
      }
      let mediaTypesOption;
      try {
        if (ImagePicker.MediaType && ImagePicker.MediaType.Images) mediaTypesOption = ImagePicker.MediaType.Images;
  else if (ImagePicker.MediaType) mediaTypesOption = ImagePicker.MediaType.Images;
  else if (ImagePicker.MediaTypeOptions && ImagePicker.MediaTypeOptions.Images) mediaTypesOption = ImagePicker.MediaTypeOptions.Images;
      } catch (e) { mediaTypesOption = undefined }
      const opts = { allowsEditing: true, quality: 0.8 };
      if (mediaTypesOption) opts.mediaTypes = mediaTypesOption;
      const res = await ImagePicker.launchImageLibraryAsync(opts);
      if (!res.canceled) setImage(res.assets[0].uri);
    } catch (err) {
      console.log('[ImagePicker error]', err);
      Alert.alert('Lỗi', 'Không thể mở album ảnh');
    }
  };

  const handleCreate = async () => {
    if (!title) return Alert.alert('Thiếu tiêu đề');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('description', description);
      if (image) fd.append('image', { uri: image, name: 'promo.jpg', type: 'image/jpeg' });
      await API.post('/restaurants/my-promotions/', fd);
      Alert.alert('Thành công', 'Khuyến mãi được tạo');
      navigation.goBack();
    } catch (err) {
      console.log('❌ Lỗi tạo promotion:', err.response?.data || err.message);
      Alert.alert('Lỗi', 'Không thể tạo khuyến mãi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ padding: 12 }}>
      <Text variant="titleLarge">Tạo khuyến mãi</Text>
      <TextInput label="Tiêu đề" value={title} onChangeText={setTitle} style={{ marginTop: 12 }} />
      <TextInput label="Mô tả" value={description} onChangeText={setDescription} multiline style={{ marginTop: 12 }} />
      <Button mode="outlined" onPress={pickImage} style={{ marginTop: 12 }}>Chọn ảnh</Button>
      {image ? <Image source={{ uri: image }} style={{ width: 200, height: 120, marginTop: 8 }} /> : null}
      <Button mode="contained" onPress={handleCreate} loading={loading} style={{ marginTop: 16 }}>Tạo</Button>
    </View>
  );
}
