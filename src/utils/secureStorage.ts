/**
 * 安全的本地儲存工具
 * 提供基本的加密保護，防止敏感資料直接暴露在 localStorage
 */

class SecureStorage {
  private static encryptionKey = 'lovable-admin-key-2025'; // 簡單的混淆密鑰

  // 簡單的字符串加密（XOR）
  private static encrypt(text: string): string {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length)
      );
    }
    return btoa(result);
  }

  // 簡單的字符串解密（XOR）
  private static decrypt(encrypted: string): string {
    try {
      const decoded = atob(encrypted);
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(
          decoded.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length)
        );
      }
      return result;
    } catch {
      return '';
    }
  }

  static setItem(key: string, value: string): void {
    try {
      const encrypted = this.encrypt(value);
      localStorage.setItem(`secure_${key}`, encrypted);
    } catch (error) {
      console.error('儲存資料時發生錯誤:', error);
    }
  }

  static getItem(key: string): string | null {
    try {
      const encrypted = localStorage.getItem(`secure_${key}`);
      if (!encrypted) return null;
      return this.decrypt(encrypted);
    } catch (error) {
      console.error('讀取資料時發生錯誤:', error);
      return null;
    }
  }

  static removeItem(key: string): void {
    localStorage.removeItem(`secure_${key}`);
  }

  static clear(): void {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('secure_')) {
        localStorage.removeItem(key);
      }
    });
  }
}

export default SecureStorage;