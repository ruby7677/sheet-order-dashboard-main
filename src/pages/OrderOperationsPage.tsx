import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { clearResolvedOperation } from '@/services/orderMutations';
import {
  loadOperationsPage,
  OperationsCapacityError,
  OperationsPageExpiredError,
  OperationsPaginationError,
  type OperationsEndpoint,
  type OperationsPageState,
} from '@/services/operationsPagination';

interface Management {
  id: string;
  order_id: string;
  kind: string;
  actor: string;
  created_at: string;
  phase: string;
}

interface Checkout {
  order_id: string;
  customer_name: string;
  phone_tail: string;
  created_at: string;
  phase: string;
  customer_pending: boolean;
  stock_pending: boolean;
  sms_state: string;
  sms_reason: string;
  primary_present: boolean;
}

interface Audit extends Management {
  before_fields: string;
  after_fields: string;
  resolved_by?: string;
  resolution_reason?: string;
}

type SectionLoadState = 'loading' | 'success' | 'error';
type FailedAction = 'refresh' | 'more' | null;
type SectionErrorKind = 'expired' | 'capacity' | 'invalid' | 'other' | null;

interface OperationsSection<T> {
  page: OperationsPageState<T> | null;
  status: SectionLoadState;
  loadingMore: boolean;
  errorKind: SectionErrorKind;
  failedAction: FailedAction;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
}
interface PendingAgeCounts {
  overdue: number;
  timeUnconfirmed: number;
}

const PENDING_ALERT_AGE_MS = 30 * 60 * 1000;
const CLOCK_REFRESH_MS = 60 * 1000;
const ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000;

function countPendingAge(rows: ReadonlyArray<{ created_at: string }>, now: number): PendingAgeCounts {
  return rows.reduce<PendingAgeCounts>((counts, row) => {
    const createdAt = Date.parse(row.created_at || '');
    if (!Number.isFinite(createdAt) || createdAt > now + ALLOWED_CLOCK_SKEW_MS) {
      counts.timeUnconfirmed += 1;
    } else if (now - createdAt >= PENDING_ALERT_AGE_MS) {
      counts.overdue += 1;
    }
    return counts;
  }, { overdue: 0, timeUnconfirmed: 0 });
}

function classifyPageError(error: unknown): Exclude<SectionErrorKind, null> {
  if (error instanceof OperationsPageExpiredError) return 'expired';
  if (error instanceof OperationsCapacityError) return 'capacity';
  if (error instanceof OperationsPaginationError && error.kind === 'invalid') return 'invalid';
  return 'other';
}

const labels: Record<string, string> = {
  items: '商品與金額',
  status: '訂單狀態',
  payment: '款項狀態',
  delete: '刪除存檔',
  pricing: '確認成交單價',
};

const columnLabels: Record<string, string> = {
  '8': '商品',
  '9': '金額',
  '14': '訂單狀態',
  '15': '款項狀態',
  '17': '存檔時間',
};

function useOperationsSection<T>(
  endpoint: OperationsEndpoint,
  identify: (row: T) => string,
): OperationsSection<T> {
  const [page, setPage] = useState<OperationsPageState<T> | null>(null);
  const [status, setStatus] = useState<SectionLoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorKind, setErrorKind] = useState<SectionErrorKind>(null);
  const [failedAction, setFailedAction] = useState<FailedAction>(null);
  const requestVersion = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestVersion.current;
    setStatus('loading');
    setLoadingMore(false);
    setErrorKind(null);
    setFailedAction(null);
    try {
      const freshPage = await loadOperationsPage<T>(endpoint, identify);
      if (request !== requestVersion.current) return;
      setPage(freshPage);
      setStatus('success');
    } catch (error) {
      if (request !== requestVersion.current) return;
      setErrorKind(classifyPageError(error));
      setFailedAction('refresh');
      setStatus('error');
    }
  }, [endpoint, identify]);

  const loadMore = useCallback(async () => {
    if (!page?.hasMore || page.nextCursor === null || loadingMore || status === 'loading' || errorKind === 'expired' || errorKind === 'invalid') return;
    const request = ++requestVersion.current;
    setLoadingMore(true);
    setErrorKind(null);
    setFailedAction(null);
    try {
      const nextPage = await loadOperationsPage<T>(endpoint, identify, page);
      if (request !== requestVersion.current) return;
      setPage(nextPage);
      setStatus('success');
    } catch (error) {
      if (request !== requestVersion.current) return;
      setErrorKind(classifyPageError(error));
      setFailedAction('more');
      setStatus('error');
    } finally {
      if (request === requestVersion.current) setLoadingMore(false);
    }
  }, [endpoint, errorKind, identify, loadingMore, page, status]);

  useEffect(() => () => { requestVersion.current += 1; }, []);

  return { page, status, loadingMore, errorKind, failedAction, reload, loadMore };
}

const managementIdentity = (row: Management) => row.id;
const checkoutIdentity = (row: Checkout) => row.order_id;
const auditIdentity = (row: Audit) => row.id;

function listFailureText<T>(section: OperationsSection<T>, label: string): string {
  if (section.errorKind === 'expired') return `${label}的資料快照已更新，請重新讀取整份清單。`;
  if (section.errorKind === 'capacity') return `${label}超過安全讀取上限，暫時無法完整載入；已保留先前成功資料（如有）。`;
  if (section.errorKind === 'invalid') return `${label}分頁資料不一致，請重新讀取整份清單。`;
  if (section.failedAction === 'more') return `${label}載入更多失敗；已保留先前成功資料，可重試。`;
  return section.page
    ? `${label}重新讀取失敗；已保留上次成功資料。`
    : `${label}載入失敗，請重新讀取。`;
}

function summaryFailureText<T>(section: OperationsSection<T>, label: string): string {
  if (section.errorKind === 'capacity') return `${label}資料量達安全讀取上限，暫時無法完整計算。`;
  if (section.errorKind === 'expired') return `${label}資料快照已更新，請重新讀取。`;
  if (section.errorKind === 'invalid') return `${label}分頁資料不一致，請重新讀取。`;
  return `${label}讀取失敗，暫時無法計算。`;
}

function retainedSummaryNote<T>(section: OperationsSection<T>): string {
  if (section.errorKind === 'capacity') return '（已達安全讀取上限，統計僅使用先前成功載入資料）';
  if (section.errorKind === 'expired') return '（快照已更新，統計僅使用先前成功載入資料）';
  if (section.errorKind === 'invalid') return '（分頁資料不一致，統計僅使用先前成功載入資料）';
  return '（重新讀取失敗，統計仍使用上次成功資料）';
}

function SectionProgress<T>({
  section,
  label,
  reload,
  loadMore,
  disabled,
}: {
  section: OperationsSection<T>;
  label: string;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  disabled: boolean;
}) {
  const page = section.page;
  return (
    <div className="flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {page ? (
          <p>已載入 {page.rows.length} / {page.total} 筆。</p>
        ) : section.status === 'loading' ? (
          <p role="status">{label}載入中…</p>
        ) : null}
        {section.status === 'loading' && page && <p role="status">重新讀取中，仍顯示上次成功資料。</p>}
        {section.status === 'error' && <p role="alert" className="text-red-600">{listFailureText(section, label)}</p>}
        {section.loadingMore && <p role="status">正在載入更多…</p>}
        {section.status === 'error' && (section.errorKind === 'expired' || section.errorKind === 'invalid') && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            disabled={disabled || section.loadingMore}
          >
            重新讀取{label}
          </Button>
        )}
      </div>
      {page?.hasMore && section.errorKind !== 'expired' && section.errorKind !== 'invalid' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadMore()}
          disabled={disabled || section.loadingMore || section.status === 'loading'}
        >
          載入更多{label}
        </Button>
      )}
    </div>
  );
}

function fieldText(json: string, before = false): string {
  try {
    const value = JSON.parse(json);
    const fields = value.fields;
    return Object.entries(fields || {})
      .map(([key, item]) => `${columnLabels[key] || key}：${String(item)}`)
      .join('；') || (before ? '原成交單價紀錄' : '成交單價已確認');
  } catch {
    return '紀錄需核對';
  }
}

export default function OrderOperationsPage() {
  const managementList = useOperationsSection('/api/orders/pending', managementIdentity);
  const checkoutList = useOperationsSection('/api/checkouts/pending', checkoutIdentity);
  const auditList = useOperationsSection('/api/orders/audit', auditIdentity);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const management = managementList.page?.rows ?? [];
  const checkouts = checkoutList.page?.rows ?? [];
  const audit = auditList.page?.rows ?? [];
  const listsBusy = [managementList, checkoutList, auditList].some((list) => list.status === 'loading' || list.loadingMore);
  const busy = actionBusy || listsBusy;

  const load = useCallback(async () => {
    setActionError('');
    await Promise.all([managementList.reload(), checkoutList.reload(), auditList.reload()]);
  }, [auditList.reload, checkoutList.reload, managementList.reload]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), CLOCK_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (url: string, body: Record<string, string>, orderId: string) => {
    const reason = window.prompt('請填寫核對依據與原因（至少三個字）');
    if (!reason || reason.trim().length < 3) return;

    setActionBusy(true);
    setActionError('');
    try {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, reason }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '結果仍待核對');
      clearResolvedOperation(orderId);
      window.dispatchEvent(new Event('orders:reload'));
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '結果尚待確認');
    } finally {
      setActionBusy(false);
    }
  };

  const when = (value: string) => value
    ? new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
    : '';

  const managementAge = managementList.page ? countPendingAge(management, clockNow) : null;
  const checkoutAge = checkoutList.page ? countPendingAge(checkouts, clockNow) : null;
  const smsBudgetSkipped = checkoutList.page
    ? checkouts.filter((item) => item.sms_state === 'budget_skipped').length
    : null;
  const smsUncertain = checkoutList.page
    ? checkouts.filter((item) => item.sms_state === 'uncertain' || item.sms_state === 'attempting').length
    : null;
  const customerSyncPending = checkoutList.page
    ? checkouts.filter((item) => item.customer_pending).length
    : null;
  const stockConfirmationPending = checkoutList.page
    ? checkouts.filter((item) => item.stock_pending).length
    : null;
  const missingPrimary = checkoutList.page
    ? checkouts.filter((item) => !item.primary_present).length
    : null;
  const managementComplete = managementList.page !== null && !managementList.page.hasMore
    && managementList.status === 'success' && !managementList.loadingMore;
  const checkoutsComplete = checkoutList.page !== null && !checkoutList.page.hasMore
    && checkoutList.status === 'success' && !checkoutList.loadingMore;
  const auditComplete = auditList.page !== null && !auditList.page.hasMore
    && auditList.status === 'success' && !auditList.loadingMore;
  const noPendingAlerts = managementComplete && checkoutsComplete && auditComplete
    && managementAge !== null && checkoutAge !== null
    && managementAge.overdue === 0 && managementAge.timeUnconfirmed === 0
    && checkoutAge.overdue === 0 && checkoutAge.timeUnconfirmed === 0
    && smsBudgetSkipped === 0 && smsUncertain === 0
    && customerSyncPending === 0 && stockConfirmationPending === 0 && missingPrimary === 0;

  return (
    <section className="space-y-6 p-4 pt-20 lg:pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold sm:text-2xl">待辦對帳與操作紀錄</h1>
        <Button className="self-start sm:self-auto" onClick={() => void load()} disabled={busy}>
          重新讀取
        </Button>
      </div>

      <section
        aria-label="後台提醒摘要"
        aria-live="polite"
        role="status"
        data-testid="operations-alert-summary"
        className="space-y-1 rounded border p-3"
      >
        <h2 className="font-semibold">後台提醒</h2>
        <p>超過 30 分鐘為操作提醒，不代表履約時限。</p>
        <p>摘要只計算已成功載入的項目。</p>
        {managementList.page ? (
          <p>
            管理操作逾時：{managementAge?.overdue ?? 0} 筆；時間待確認：{managementAge?.timeUnconfirmed ?? 0} 筆；
            已載入 {managementList.page.rows.length} / {managementList.page.total} 筆。
            {managementList.status === 'error' ? retainedSummaryNote(managementList) : ''}
          </p>
        ) : managementList.status === 'loading' ? (
          <p>管理操作摘要載入中…</p>
        ) : managementList.status === 'error' ? (
          <p>{summaryFailureText(managementList, '管理操作摘要')}</p>
        ) : null}
        {checkoutList.page ? (
          <p>
            下單／通知逾時：{checkoutAge?.overdue ?? 0} 筆；時間待確認：{checkoutAge?.timeUnconfirmed ?? 0} 筆；
            客戶同步待辦：{customerSyncPending ?? 0} 筆；庫存確認待辦：{stockConfirmationPending ?? 0} 筆；主表資料待核對：{missingPrimary ?? 0} 筆；
            簡訊額度略過：{smsBudgetSkipped ?? 0} 筆；簡訊結果待核對：{smsUncertain ?? 0} 筆；
            已載入 {checkoutList.page.rows.length} / {checkoutList.page.total} 筆。
            {checkoutList.status === 'error' ? retainedSummaryNote(checkoutList) : ''}
          </p>
        ) : checkoutList.status === 'loading' ? (
          <p>下單／通知摘要載入中…</p>
        ) : checkoutList.status === 'error' ? (
          <p>{summaryFailureText(checkoutList, '下單／通知摘要')}</p>
        ) : null}
        {(managementList.page?.hasMore || checkoutList.page?.hasMore || auditList.page?.hasMore) && (
          <p role="status">尚有未載入項目；提醒摘要目前不是全量。</p>
        )}
        {(managementList.loadingMore || checkoutList.loadingMore || auditList.loadingMore) && (
          <p role="status">正在載入更多資料；提醒摘要尚未完成更新。</p>
        )}
        {noPendingAlerts && (
          <p>已完整載入管理及下單／通知清單，目前沒有逾時或簡訊待核對事項。</p>
        )}
      </section>

      {actionError && <p role="alert" className="text-red-600">操作失敗：{actionError}</p>}
      <p>結果不明時不會自動補寫或重寄。請先核對 Sheet；備註仍可直接在 Sheet 修改。操作紀錄與稽核資料不會自動刪除，清單達安全讀取上限時會提示。</p>

      <section aria-labelledby="management-title" className="space-y-2">
        <h2 id="management-title" className="text-xl font-semibold">管理操作待確認</h2>
        {managementList.status === 'success' && management.length === 0 && managementList.page?.hasMore === false && (
          <p>目前沒有待確認的管理操作。</p>
        )}
        {management.map((item) => (
          <article key={item.id} className="my-2 space-y-2 rounded border p-3">
            <p>{labels[item.kind] || item.kind}｜{when(item.created_at)}｜{item.actor}</p>
            <p>訂單識別：{item.order_id}</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void act('/api/orders/reconcile', { operation_id: item.id, action: 'confirm' }, item.order_id)}>
                核對已寫入並完成
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void act('/api/orders/reconcile', { operation_id: item.id, action: 'abandon' }, item.order_id)}>
                核對未寫入並撤回
              </Button>
            </div>
          </article>
        ))}
        <SectionProgress
          section={managementList}
          label="管理操作"
          reload={managementList.reload}
          loadMore={managementList.loadMore}
          disabled={actionBusy}
        />
      </section>

      <section aria-labelledby="checkouts-title" className="space-y-2">
        <h2 id="checkouts-title" className="text-xl font-semibold">下單／通知待辦</h2>
        {checkoutList.status === 'success' && checkouts.length === 0 && checkoutList.page?.hasMore === false && (
          <p>目前沒有下單或通知待辦。</p>
        )}
        {checkouts.map((item) => (
          <article key={item.order_id} className="my-2 space-y-2 rounded border p-3">
            <p>{item.customer_name}｜電話末四碼 {item.phone_tail}｜{when(item.created_at)}</p>
            <p>訂單識別：{item.order_id}</p>
            {!item.primary_present ? (
              <p>主表無可確認的對應紀錄，可能曾由舊後台刪除；不會自動重建或回補。</p>
            ) : (
              <p>
                {item.customer_pending ? '客戶同步待核對。' : ''}
                {item.stock_pending ? '庫存確認待核對。' : ''}
                {item.sms_state === 'budget_skipped'
                  ? '簡訊因額度限制略過。'
                  : item.sms_state === 'uncertain' || item.sms_state === 'attempting'
                    ? '簡訊結果不明，請核對供應商紀錄；不提供盲目重寄。'
                    : ''}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {!item.primary_present && item.phase === 'order_written' ? (
                <Button variant="outline" disabled={busy} onClick={() => void act('/api/checkouts/reconcile', { order_id: item.order_id, action: 'close_missing_primary' }, item.order_id)}>
                  核對舊紀錄並結案
                </Button>
              ) : item.primary_present ? (
                <>
                  <Button disabled={busy} onClick={() => void act('/api/checkouts/reconcile', { order_id: item.order_id, action: 'confirm_existing' }, item.order_id)}>
                    確認既有寫入
                  </Button>
                  {item.customer_pending && (
                    <Button disabled={busy} onClick={() => void act('/api/checkouts/reconcile', { order_id: item.order_id, action: 'retry_customer' }, item.order_id)}>
                      核對客戶同步後重試
                    </Button>
                  )}
                  {item.stock_pending && (
                    <Button disabled={busy} onClick={() => void act('/api/checkouts/reconcile', { order_id: item.order_id, action: 'confirm_stock' }, item.order_id)}>
                      完成庫存確認
                    </Button>
                  )}
                  {item.sms_state === 'budget_skipped' && (
                    <Button disabled={busy} onClick={() => void act('/api/checkouts/reconcile', { order_id: item.order_id, action: 'retry_budget_sms' }, item.order_id)}>
                      額度允許後送出簡訊
                    </Button>
                  )}
                </>
              ) : null}
            </div>
          </article>
        ))}
        <SectionProgress
          section={checkoutList}
          label="下單／通知"
          reload={checkoutList.reload}
          loadMore={checkoutList.loadMore}
          disabled={actionBusy}
        />
      </section>

      <section aria-labelledby="audit-title" className="space-y-2">
        <h2 id="audit-title" className="text-xl font-semibold">最近操作紀錄</h2>
        {auditList.status === 'success' && audit.length === 0 && auditList.page?.hasMore === false && (
          <p>目前沒有操作紀錄。</p>
        )}
        {audit.map((item) => (
          <article key={item.id} className="my-2 rounded border p-3">
            <p>{when(item.created_at)}｜{item.actor}｜{labels[item.kind] || item.kind}｜{item.phase === 'completed' ? '完成' : item.phase === 'rejected' ? '撤回' : '待核對'}</p>
            <p>原值：{fieldText(item.before_fields, true)}</p>
            <p>新值：{fieldText(item.after_fields)}</p>
            {item.resolution_reason && <p>原因：{item.resolution_reason}｜核對者：{item.resolved_by}</p>}
          </article>
        ))}
        <SectionProgress
          section={auditList}
          label="操作紀錄"
          reload={auditList.reload}
          loadMore={auditList.loadMore}
          disabled={actionBusy}
        />
      </section>
    </section>
  );
}
