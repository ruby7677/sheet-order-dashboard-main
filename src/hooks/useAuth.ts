import { useState, useEffect, createContext, useContext } from 'react';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
}

interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAuthProvider = (): AuthContextType => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing token on mount
    const storedToken = localStorage.getItem('admin_token');
    const storedUser = localStorage.getItem('admin_user');
    
    if (storedToken && storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        // Verify token is not expired
        const payload = JSON.parse(atob(storedToken.split('.')[1]));
        const currentTime = Math.floor(Date.now() / 1000);
        
        if (payload.exp > currentTime) {
          setToken(storedToken);
          setUser(userData);
        } else {
          // Token expired, clear storage
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
        }
      } catch (error) {
        console.error('Error parsing stored auth data:', error);
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    try {
      const response = await fetch('https://skcdapfynyszxyqqsvib.supabase.co/functions/v1/admin-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (result.success && result.token && result.user) {
        setToken(result.token);
        setUser(result.user);
        localStorage.setItem('admin_token', result.token);
        localStorage.setItem('admin_user', JSON.stringify(result.user));
        return { success: true };
      } else {
        return { success: false, message: result.message || '登入失敗' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: '網路錯誤，請稍後再試' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
  };

  return {
    user,
    token,
    isLoading,
    login,
    logout,
    isAuthenticated: !!user && !!token,
  };
};