import axios from 'axios';

const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  '/api';

export const api = axios.create({
  baseURL: apiBaseUrl,
});

api.interceptors.request.use(
  (config) => {
    const token =
      localStorage.getItem('token');

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }

    return config;
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401
    ) {
      localStorage.removeItem(
        'token'
      );
    }

    return Promise.reject(error);
  }
);

export const get = async <T>(
  url: string
): Promise<T> => {
  const response =
    await api.get<{ data: T }>(
      url
    );

  return response.data.data;
};
