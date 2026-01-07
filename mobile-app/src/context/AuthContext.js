// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../api/axiosInstance";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load token + user từ AsyncStorage khi mở app
  useEffect(() => {
    const loadStorage = async () => {
      try {
        let token = await AsyncStorage.getItem("accessToken");
        const refreshToken = await AsyncStorage.getItem("refreshToken");
        const userData = await AsyncStorage.getItem("user");
        
        // Nếu có token, thử verify hoặc refresh
        if (token || refreshToken) {
          try {
            // Nếu không có accessToken nhưng còn refreshToken, tự động refresh
            if (!token && refreshToken) {
              console.log("🔄 Đang refresh token...");
              const res = await API.post("/auth/token/refresh/", { refresh: refreshToken });
              token = res.data.access;
              await AsyncStorage.setItem("accessToken", token);
              await AsyncStorage.setItem("access_token", token);
              console.log("✅ Refresh token thành công");
            }
            
            if (token) {
              setAccessToken(token);
              API.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            }
          } catch (err) {
            console.log("❌ Token hết hạn hoặc không hợp lệ:", err.response?.data || err.message);
            // Token không hợp lệ - xóa tất cả và yêu cầu đăng nhập lại
            await AsyncStorage.multiRemove(["accessToken", "access_token", "refreshToken", "refresh_token", "user"]);
            delete API.defaults.headers.common['Authorization'];
            setAccessToken(null);
            setUser(null);
            setLoading(false);
            return; // Dừng lại, không load user data
          }
        }
        
        // Load user data nếu có token hợp lệ
        if (token && userData) {
          setUser(JSON.parse(userData));
        } else if (token) {
          // Nếu có token mà không có user, gọi API lấy lại user info
          try {
            const res = await API.get("/auth/profile/");
            const user = res.data;
            setUser(user);
            await AsyncStorage.setItem("user", JSON.stringify(user));
          } catch (err) {
            console.log("❌ Lỗi fetch user info:", err.response?.data || err.message);
            // Nếu lỗi 401/403, xóa token và yêu cầu đăng nhập lại
            if (err.response?.status === 401 || err.response?.status === 403) {
              await AsyncStorage.multiRemove(["accessToken", "access_token", "refreshToken", "refresh_token", "user"]);
              delete API.defaults.headers.common['Authorization'];
              setAccessToken(null);
            }
            setUser(null);
          }
        }
      } catch (e) {
        console.log("❌ Lỗi load storage:", e);
      } finally {
        setLoading(false);
      }
    };
    loadStorage();
  }, []);

  // Đăng ký
  const register = async (formData) => {
    try {
      const res = await API.post("/auth/register/", formData);
      return { success: true, data: res.data };
    } catch (err) {
      console.log("❌ Lỗi register:", err.response?.data || err.message);
      return { success: false, error: err.response?.data || err.message };
    }
  };

  // Đăng nhập
  const login = async (username, password) => {
    try {
      const res = await API.post("/auth/login/", { 
        username: username.trim(),
        password: password
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('Login response:', res.data);

      // Backend trả về { tokens: { access, refresh }, user }
      const { tokens, user } = res.data;
      const access = tokens?.access || res.data.access;
      const refresh = tokens?.refresh || res.data.refresh;

      if (!access || !refresh) {
        throw new Error("Không nhận được token từ server");
      }

      await AsyncStorage.setItem("accessToken", access);
      await AsyncStorage.setItem("refreshToken", refresh);
      await AsyncStorage.setItem("access_token", access);
      await AsyncStorage.setItem("refresh_token", refresh);
      
      if (user) {
        await AsyncStorage.setItem("user", JSON.stringify(user));
        setUser(user);
      }
      
      setAccessToken(access);
      
      // Set default Authorization header for future requests
      API.defaults.headers.common['Authorization'] = `Bearer ${access}`;

      // Đảm bảo cập nhật state xong mới trả về
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { success: true, user };
    } catch (err) {
      console.log("❌ Lỗi login:", err.response?.data || err.message);
      return { 
        success: false, 
        error: err.response?.data?.detail || 
               err.response?.data?.message || 
               err.message || 
               'Đã xảy ra lỗi khi đăng nhập' 
      };
    }
  };

  // Đăng xuất
  const logout = async () => {
    try {
      // Get the refresh token before clearing storage
      const refresh = await AsyncStorage.getItem('refreshToken') || await AsyncStorage.getItem('refresh_token');
      
      // Clear local storage first to prevent race conditions
      await AsyncStorage.multiRemove(["accessToken", "access_token", "refreshToken", "refresh_token", "user"]);
      
      // Update state
      setAccessToken(null);
      setUser(null);
      
      // Clear default Authorization header
      delete API.defaults.headers.common['Authorization'];

      // Try to call the logout endpoint, but don't wait for it
      if (refresh) {
        // Use a timeout to prevent blocking the UI
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
        
        try {
          await API.post('/auth/logout/', 
            { refresh },
            { 
              signal: controller.signal,
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              }
            }
          );
        } catch (e) {
          // Ignore errors from the logout endpoint
          console.log('Logout API call failed (non-critical):', e.message);
        } finally {
          clearTimeout(timeoutId);
        }
      }
      
      return { success: true };
    } catch (e) {
      console.error('Logout error:', e);
      // Ensure we clear everything even if there was an error
      await AsyncStorage.multiRemove(["accessToken", "access_token", "refreshToken", "refresh_token", "user"]);
      setAccessToken(null);
      setUser(null);
      return { success: false, error: e.message };
    }
  };

  // Cập nhật profile (gọi API backend nếu cần)
  const updateProfile = async (payload) => {
    try {
      console.log('AuthContext.updateProfile - payload:', JSON.stringify(payload, null, 2))
      let res
      
      // If avatarUri exists and it's a local file -> use multipart form
      if (payload?.avatarUri && (payload.avatarUri.startsWith('file://') || !payload.avatarUri.startsWith('http'))) {
        console.log('Preparing file upload with avatar')
        
        // Create form data
        const formData = new FormData()
        
        // Add all non-avatar fields to form data
        console.log('Adding form fields:')
        Object.entries(payload).forEach(([key, value]) => {
          if (key !== 'avatarUri' && value !== undefined && value !== null) {
            const val = typeof value === 'object' ? JSON.stringify(value) : String(value)
            console.log(`- ${key}:`, val)
            formData.append(key, val)
          }
        })

        // Handle avatar file upload
        const uri = payload.avatarUri
        const filename = uri.split('/').pop()
        const match = /\.(\w+)$/.exec(filename)
        const type = match ? `image/${match[1]}` : 'image/jpeg'
        
        const fileObj = {
          uri,
          name: `avatar_${Date.now()}.${match ? match[1] : 'jpg'}`,
          type,
        }
        
        console.log('Adding file to form:', fileObj)
        formData.append('avatar', fileObj)

        // Log form data for debugging
        console.log('FormData entries:')
        if (formData._parts) {
          formData._parts.forEach(([key, value]) => {
            console.log(`- ${key}:`, value)
          })
        }

        // Create a new XMLHttpRequest for better control over the upload
        const uploadWithXHR = async () => {
          const token = await AsyncStorage.getItem('accessToken');
          return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open('PUT', API.defaults.baseURL + 'auth/profile/')
            xhr.setRequestHeader('Accept', 'application/json')
            xhr.setRequestHeader('Authorization', `Bearer ${token}`)
            
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  resolve(JSON.parse(xhr.response))
                } catch (e) {
                  resolve(xhr.response)
                }
              } else {
                reject(new Error(`Request failed with status ${xhr.status}`))
              }
            }
            
            xhr.onerror = () => reject(new Error('Network Error'))
            xhr.ontimeout = () => reject(new Error('Request timeout'))
            
            // Send FormData directly
            xhr.send(formData)
          })
        }

        console.log('Sending multipart form data with avatar')
        try {
          // First try with XMLHttpRequest
          const response = await uploadWithXHR()
          res = { data: response }
        } catch (xhrError) {
          console.warn('XHR upload failed, falling back to axios:', xhrError)
          // Fallback to axios if XHR fails
          res = await API.put('/auth/profile/', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
              'Accept': 'application/json',
            },
            transformRequest: () => formData,
          })
        }
      } else {
        // Regular JSON update (no file upload)
        const { avatarUri, ...updateData } = payload
        console.log('Sending JSON update:', updateData)
        res = await API.put('/auth/profile/', updateData)
      }

      console.log('Profile update successful:', res.data)
      const updated = res.data
      setUser(updated)
      await AsyncStorage.setItem('user', JSON.stringify(updated))
      return { success: true, data: updated }
    } catch (err) {
      console.error('❌ Lỗi updateProfile:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        config: {
          url: err.config?.url,
          method: err.config?.method,
          headers: err.config?.headers,
          data: err.config?.data,
        },
      })
      
      let errorMessage = 'Có lỗi xảy ra khi cập nhật thông tin'
      if (err.response) {
        // Handle different HTTP error statuses
        if (err.response.status === 413) {
          errorMessage = 'Kích thước ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 5MB.'
        } else if (err.response.status === 400) {
          errorMessage = err.response.data?.message || 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.'
        } else if (err.response.status >= 500) {
          errorMessage = 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.'
        }
      } else if (err.message === 'Network Error') {
        errorMessage = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng của bạn.'
      }
      
      return { 
        success: false, 
        error: { 
          message: errorMessage,
          details: err.response?.data || err.message 
        } 
      }
    }
  };

  // Handle auth errors (token expired) - force logout
  const handleAuthError = async () => {
    console.log('[AuthContext] Handling auth error - forcing logout');
    await AsyncStorage.multiRemove(["accessToken", "access_token", "refreshToken", "refresh_token", "user"]);
    delete API.defaults.headers.common['Authorization'];
    setAccessToken(null);
    setUser(null);
  };

  // Check if user is authenticated
  const isAuthenticated = !!accessToken && !!user;

  return (
    <AuthContext.Provider
      value={{ user, accessToken, loading, register, login, logout, updateProfile, handleAuthError, isAuthenticated }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
