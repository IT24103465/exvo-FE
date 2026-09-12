// Point to API Gateway or direct AuthService port
const PRIMARY_API_URL = 'http://localhost:5000/api/auth';
const FALLBACK_API_URL = 'http://localhost:5284/api/auth';

const fetchWithFallback = async (endpoint, options = {}) => {
  try {
    const res = await fetch(`${PRIMARY_API_URL}${endpoint}`, options);
    return res;
  } catch (err) {
    // If gateway connection fails, automatically route to direct AuthService port
    return await fetch(`${FALLBACK_API_URL}${endpoint}`, options);
  }
};

export const registerUser = async (
  payloadOrFullName,
  email,
  password,
  role = 'Attendee',
  companyName = null,
  companyRegNumber = null,
  contactNumber = null
) => {
  let body;
  if (typeof payloadOrFullName === 'object' && payloadOrFullName !== null) {
    body = payloadOrFullName;
  } else {
    body = {
      fullName: payloadOrFullName,
      email,
      password,
      role,
      companyName,
      companyRegNumber,
      contactNumber,
    };
  }

  const response = await fetchWithFallback('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let data = {};
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  if (data.token) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
  }
  return data;
};

export const loginUser = async (email, password) => {
  const response = await fetchWithFallback('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  let data = {};
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(data.message || `Login failed with status ${response.status}`);
  }

  if (data.token) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
  }
  return data;
};

export const getCurrentUserProfile = async () => {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const response = await fetchWithFallback('/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token');
        return null;
      }
      // Fallback to /me
      const meRes = await fetchWithFallback('/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (meRes.ok) {
        return await meRes.json();
      }
      return null;
    }

    const profile = await response.json();
    // Update cached user in localStorage
    const cachedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const updatedUser = {
      ...cachedUser,
      fullName: profile.name || cachedUser.fullName,
      email: profile.email || cachedUser.email,
      contactNumber: profile.phoneNumber || cachedUser.contactNumber,
      address: profile.address || cachedUser.address,
      profilePicture: profile.profilePicture || cachedUser.profilePicture,
    };
    localStorage.setItem('user', JSON.stringify(updatedUser));

    return profile;
  } catch {
    return null;
  }
};

export const updateUserProfile = async (profileData) => {
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetchWithFallback('/profile', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: profileData.name || profileData.fullName,
      email: profileData.email,
      address: profileData.address || null,
      phoneNumber: profileData.phoneNumber || profileData.contactNumber || null,
      profilePicture: profileData.profilePicture || null,
    }),
  });

  let data = {};
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(data.message || `Update profile failed with status ${response.status}`);
  }

  // Update localStorage
  const cachedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const updatedUser = {
    ...cachedUser,
    fullName: data.name || profileData.name,
    email: data.email || profileData.email,
    contactNumber: data.phoneNumber || profileData.phoneNumber,
    address: data.address || profileData.address,
    profilePicture: data.profilePicture || profileData.profilePicture,
  };
  localStorage.setItem('user', JSON.stringify(updatedUser));

  return data;
};

export const logoutUser = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};