// Point directly to the API Gateway instead of the AuthService port
const API_URL = 'http://localhost:5000/api/auth';

export const registerUser = async (fullName, email, password) => {
  const response = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName, email, password, role: 'Attendee' }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Registration failed');

  if (data.token) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
  }
  return data;
};

export const loginUser = async (email, password) => {
  const response = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Login failed');

  if (data.token) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
  }
  return data;
};

export const getCurrentUserProfile = async () => {
  const token = localStorage.getItem('token');
  if (!token) return null;

  const response = await fetch(`${API_URL}/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    localStorage.removeItem('token');
    return null;
  }
  return await response.json();
};

export const logoutUser = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};