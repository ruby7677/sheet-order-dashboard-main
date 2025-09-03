import { useState, useEffect, useCallback } from 'react';

interface UseScrollAwareMenuOptions {
  /** 隱藏按鈕的滾動閾值（像素） */
  hideThreshold?: number;
  /** 顯示按鈕的滾動閾值（像素） */
  showThreshold?: number;
  /** 延遲隱藏時間（毫秒） */
  hideDelay?: number;
  /** 是否在頁面頂部時隱藏按鈕 */
  hideAtTop?: boolean;
  /** 最小滾動距離才觸發隱藏/顯示邏輯 */
  minScrollDistance?: number;
}

interface ScrollState {
  /** 是否應該顯示選單按鈕 */
  isVisible: boolean;
  /** 當前滾動位置 */
  scrollY: number;
  /** 滾動方向：'up' | 'down' | 'none' */
  scrollDirection: 'up' | 'down' | 'none';
  /** 是否在頁面頂部 */
  isAtTop: boolean;
  /** 是否正在滾動 */
  isScrolling: boolean;
}

const useScrollAwareMenu = (options: UseScrollAwareMenuOptions = {}): ScrollState => {
  const {
    hideThreshold = 100,
    showThreshold = 50,
    hideDelay = 150,
    hideAtTop = true,
    minScrollDistance = 10
  } = options;

  const [scrollState, setScrollState] = useState<ScrollState>({
    isVisible: true,
    scrollY: 0,
    scrollDirection: 'none',
    isAtTop: true,
    isScrolling: false
  });

  const [hideTimer, setHideTimer] = useState<NodeJS.Timeout | null>(null);
  const [lastScrollY, setLastScrollY] = useState(0);

  const updateScrollState = useCallback(() => {
    const currentScrollY = window.scrollY;
    const scrollDelta = Math.abs(currentScrollY - lastScrollY);
    
    // 如果滾動距離太小，不更新狀態
    if (scrollDelta < minScrollDistance && currentScrollY !== 0) {
      return;
    }

    const direction = currentScrollY > lastScrollY ? 'down' : currentScrollY < lastScrollY ? 'up' : 'none';
    const isAtTop = currentScrollY <= 10;

    let isVisible = true;

    // 決定按鈕可見性的邏輯
    if (hideAtTop && isAtTop) {
      // 在頁面頂部時隱藏按鈕
      isVisible = false;
    } else if (direction === 'down' && currentScrollY > hideThreshold) {
      // 向下滾動且超過隱藏閾值時隱藏
      isVisible = false;
    } else if (direction === 'up' && currentScrollY > showThreshold) {
      // 向上滾動且超過顯示閾值時顯示
      isVisible = true;
    } else if (currentScrollY <= showThreshold) {
      // 接近頂部時根據 hideAtTop 設定決定
      isVisible = !hideAtTop;
    }

    setScrollState(prev => ({
      ...prev,
      scrollY: currentScrollY,
      scrollDirection: direction,
      isAtTop,
      isVisible,
      isScrolling: true
    }));

    setLastScrollY(currentScrollY);

    // 清除之前的計時器
    if (hideTimer) {
      clearTimeout(hideTimer);
    }

    // 設置新的計時器來標記滾動結束
    const newTimer = setTimeout(() => {
      setScrollState(prev => ({ ...prev, isScrolling: false }));
    }, hideDelay);

    setHideTimer(newTimer);
  }, [lastScrollY, hideThreshold, showThreshold, hideDelay, hideAtTop, minScrollDistance, hideTimer]);

  useEffect(() => {
    // 初始化滾動位置
    const initialScrollY = window.scrollY;
    setLastScrollY(initialScrollY);
    setScrollState(prev => ({
      ...prev,
      scrollY: initialScrollY,
      isAtTop: initialScrollY <= 10,
      isVisible: hideAtTop ? initialScrollY > 10 : true
    }));

    // 使用 passive 事件監聽器優化性能
    let ticking = false;
    
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateScrollState();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
    };
  }, [updateScrollState, hideTimer, hideAtTop]);

  return scrollState;
};

export default useScrollAwareMenu;