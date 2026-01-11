import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const EMULATOR_HOST = "10.0.2.2";
const DEV_PORT = 8000;

let BASE_URL = "";
if (Platform.OS === "android") {
  BASE_URL = `http://${EMULATOR_HOST}:${DEV_PORT}/api/`;
} else if (Platform.OS === "ios") {
  BASE_URL = `http://127.0.0.1:${DEV_PORT}/api/`;
} else {
  BASE_URL = `http://127.0.0.1:${DEV_PORT}/api/`;
}

const API = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // Increased timeout for file uploads
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
  maxBodyLength: Infinity, // For large file uploads
  maxContentLength: Infinity, // For large file uploads
});
// Thay đổi phần này
// const EMULATOR_HOST = "10.0.2.2";
// const DEV_PORT = 8000;
// const API_URL = 'http://192.168.1.80:8000/api/';
// const API = axios.create({
//   baseURL: API_URL,
//   timeout: 10000,
//   headers: {
//     'Content-Type': 'application/json',
//   }
// });
// let BASE_URL = "";
// if (Platform.OS === "android") {
//   BASE_URL = `http://192.168.1.80:8000/api/`;  // Sửa thành IP thật
// } else if (Platform.OS === "ios") {
//   BASE_URL = `http://192.168.1.80:8000/api/`;  // Sửa thành IP thật
// } else {
//   BASE_URL = `http://192.168.1.80:8000/api/`;  // Sửa thành IP thật
// }
// // Các endpoint không cần xác thực
// const PUBLIC_ENDPOINTS = [
//   '/auth/',

// Helper: public endpoints that should not require auth
const isPublicEndpoint = (url = "", method = "get") => {
  try {
    const path = url.split("?")[0];
    // Some call sites may include an /api prefix; normalize so matching is consistent.
    const cleanPath = path.replace(/^\/api/, "");
    const publicPaths = [
      "/auth/login/",
      "/auth/register/",
      "/auth/token/refresh/",
      "/auth/token/verify/",
      "/restaurants/",
      "/restaurants/banners/",
      "/restaurants/categories/",
      "/restaurants/categories-with-foods/",
      "/foods/",
      "/categories/",
      "/provinces/",
      "/banners/",
      "/reviews/",
      "/ai/recommendations/",
    ];

    // Specific private endpoints that should always require auth
    const privatePaths = [
      "/auth/logout/",
      "/restaurants/my-restaurant/",
      "/restaurants/my-foods/",
    ];

    // Check if this is a private endpoint
    if (privatePaths.some((p) => cleanPath.startsWith(p))) {
      return false;
    }

    // Check if this is a public endpoint
    if (publicPaths.some((p) => cleanPath.startsWith(p))) {
      return true;
    }

    // Default to requiring auth
    return false;
  } catch (_) {
    // Default to requiring auth if there's an error
    return false;
  }
};

// Allow overriding baseURL at runtime (useful for switching between LAN/IP)
export const setApiBaseUrl = (url) => {
  if (!url) return;
  const u = url.endsWith("/") ? url : `${url}/`;
  API.defaults.baseURL = u;
};

// Gắn access token vào mỗi request, trừ các endpoint public
API.interceptors.request.use(
  async (config) => {
    const url = config.url || "";
    const method = (config.method || "get").toLowerCase();
    
    // Get token from storage early for non-public endpoints
    let token = null;
    const isPublic = isPublicEndpoint(url, method);
    
    if (!isPublic) {
      token = await AsyncStorage.getItem("accessToken") || await AsyncStorage.getItem("access_token");
      console.log('[API Request] Token from storage:', token ? 'Token exists' : 'No token found');
    }
    
    // Debug log
    console.log(`[API Request] ${method.toUpperCase()} ${url}`, {
      isPublic: isPublic,
      hasAuthHeader: !!(config.headers?.Authorization || token)
    });
    
    // Skip auth for public endpoints
    if (isPublic) {
      // IMPORTANT: Public endpoints must never include Authorization.
      // If a stale/expired token is attached, backend returns 403 even though endpoint is AllowAny.
      config.headers = config.headers || {};
      delete config.headers.Authorization;
      delete config.headers.authorization;
      return config;
    }

    // For non-public endpoints, ensure we have a token
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
      console.log('[API Request] Authorization header set with token');
    } else {
      console.warn('[API Request] No access token available for protected endpoint');
    }

    // For file uploads, let the browser set the Content-Type header
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Enhanced response interceptor with better error handling
API.interceptors.response.use(
  (response) => {
    // Handle successful responses
    return response;
  },
  async (error) => {
    const originalRequest = error?.config;
    
    // Log the error for debugging
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Response error:', {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers,
        config: {
          url: error.config.url,
          method: error.config.method,
          data: error.config.data,
        },
      });
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Request setup error:', error.message);
    }

    // Network error (không có response)
    if (!error.response) {
      return Promise.reject(error);
    }

    // Unauthorized → thử refresh token
    if (error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers["Authorization"] = "Bearer " + token;
            return API(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;
      try {
        const refreshToken = await AsyncStorage.getItem("refreshToken");
        if (!refreshToken) throw new Error("No refresh token found");

        const res = await axios.post(`${API?.defaults?.baseURL || BASE_URL}auth/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = res.data.access;
        if (!newAccessToken) throw new Error("No new access token");

        await AsyncStorage.setItem("accessToken", newAccessToken);
        // also update default header to minimize future misses
        API.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);

        originalRequest.headers["Authorization"] = "Bearer " + newAccessToken;
        return API(originalRequest);
      } catch (err) {
        console.log('[Token Refresh] Failed:', err.response?.data || err.message);
        processQueue(err, null);
        
        // Clear all tokens - user needs to login again
        await AsyncStorage.multiRemove(["accessToken", "access_token", "refreshToken", "refresh_token", "user"]);
        
        // Clear default Authorization header
        delete API.defaults.headers.common["Authorization"];
        
        // If the original request was a public GET endpoint, retry once without auth
        const url = originalRequest.url || "";
        const method = (originalRequest.method || "get").toLowerCase();
        if (isPublicEndpoint(url, method) && !originalRequest._noAuthRetry) {
          originalRequest._noAuthRetry = true;
          if (originalRequest.headers && originalRequest.headers["Authorization"]) {
            delete originalRequest.headers["Authorization"];
          }
          return API(originalRequest);
        }
        
        // Create a custom error to signal that user needs to re-login
        const authError = new Error('Session expired. Please login again.');
        authError.isAuthError = true;
        authError.originalError = err;
        return Promise.reject(authError);
      } finally {
        isRefreshing = false;
      }
    }
    // Non-401 or already retried: just propagate error
    return Promise.reject(error);
  }
);

export default API;