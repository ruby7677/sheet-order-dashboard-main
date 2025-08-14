import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrollToTopButtonProps {
  /** 顯示按鈕的滾動百分比閾值，預設為 40% */
  threshold?: number;
  /** 自定義樣式類名 */
  className?: string;
}

const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({ 
  threshold = 40,
  className 
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      // 計算滾動百分比
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const documentHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrollPercentage = (scrollTop / documentHeight) * 100;

      // 當滾動超過閾值時顯示按鈕
      setIsVisible(scrollPercentage > threshold);
    };

    // 添加滾動事件監聽器
    window.addEventListener('scroll', toggleVisibility);

    // 初始檢查
    toggleVisibility();

    // 清理事件監聽器
    return () => {
      window.removeEventListener('scroll', toggleVisibility);
    };
  }, [threshold]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <Button
      onClick={scrollToTop}
      size="icon"
      className={cn(
        "fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg",
        "bg-primary hover:bg-primary/90 text-primary-foreground",
        "transition-all duration-300 ease-in-out",
        "hover:scale-110 hover:shadow-xl",
        "border-2 border-white-20",
        "backdrop-blur-sm",
        className
      )}
      aria-label="回到頂端"
    >
      <ChevronUp className="h-5 w-5" />
    </Button>
  );
};

export default ScrollToTopButton;
