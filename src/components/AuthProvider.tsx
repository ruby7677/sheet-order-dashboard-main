import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import SecureStorage from '@/utils/secureStorage';

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = SecureStorage.getItem('admin_token');
    const storedUser = SecureStorage.getItem('admin_user');
    
    if (storedToken && storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        if (isTokenValid(storedToken)) {
          setToken(storedToken);
          setUser(userData);
        } else {
          SecureStorage.removeItem('admin_token');
          SecureStorage.removeItem('admin_user');
        }
      } catch (error) {
        console.error('解析用戶資料失敗:', error);
        SecureStorage.removeItem('admin_token');
        SecureStorage.removeItem('admin_user');
      }
    }
    
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      // 與 hooks/useAuth.ts 統一：使用 admin-auth 以簽發自有 JWT
      const response = await fetch('https://skcdapfynyszxyqqsvib.supabase.co/functions/v1/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const result = await response.json();

      if (result.success && result.token && result.user) {
        setToken(result.token);
        setUser(result.user);
        SecureStorage.setItem('admin_token', result.token);
        SecureStorage.setItem('admin_user', JSON.stringify(result.user));
        return { success: true };
      } else {
        return { success: false, message: result.message || '登入失敗' };
      }
    } catch (error) {
      console.error('登入錯誤:', error);
      return { success: false, message: '連接伺服器失敗' };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    SecureStorage.removeItem('admin_token');
    SecureStorage.removeItem('admin_user');
  };

  const isAuthenticated = !!user && !!token;

  const value: AuthContextType = useMemo(() => ({
    user,
    token,
    login,
    logout,
    isAuthenticated,
    isLoading
  }), [user, token, isAuthenticated, isLoading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

function isTokenValid(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {return false;}

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}