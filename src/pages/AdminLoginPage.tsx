import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AdminLoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin_login.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
  
      // 檢查 HTTP 狀態碼
      if (!res.ok) {
        throw new Error('伺服器錯誤，請稍後再試');
      }
  
      // 嘗試解析 JSON
      const text = await res.text();
      // console.log('raw response:', text); // 移除偵錯日誌
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error('伺服器回傳格式錯誤');
      }
  
      if (result.success) {
        if (result.token) {
          localStorage.setItem('admin_token', result.token);
          navigate('/admin/dashboard');
        } else {
          setError('登入成功，但未收到授權憑證');
        }
      } else {
        setError(result.message || '登入失敗');
      }
    } catch (err: any) {
      setError(err.message || '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form className="bg-white p-8 rounded shadow-md w-full max-w-sm" onSubmit={handleSubmit}>
        <h2 className="text-2xl font-bold mb-6 text-center">管理員登入</h2>
        {error && <div className="mb-4 text-red-600">{error}</div>}
        <div className="mb-4">
          <label className="block mb-1">帳號</label>
          <input
            type="text"
            className="w-full border border-input rounded px-3 py-2 bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="mb-6">
          <label className="block mb-1">密碼</label>
          <input
            type="password"
            className="w-full border border-input rounded px-3 py-2 bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          disabled={loading}
        >
          {loading ? '登入中…' : '登入'}
        </button>
      </form>
    </div>
  );
};

export default AdminLoginPage;
