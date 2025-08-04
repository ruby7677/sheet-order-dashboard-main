import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PaymentStatusBadge from './PaymentStatusBadge';

export type PaymentStatus = '未收費' | '已收費' | '待轉帳' | '未全款' | '特殊' | '';

interface PaymentStatusEditorProps {
  value?: PaymentStatus;
  onChange: (value: PaymentStatus) => void;
  disabled?: boolean;
}

const paymentStatusOptions: PaymentStatus[] = [
  '未收費', '已收費', '待轉帳', '未全款', '特殊'
];

const PaymentStatusEditor: React.FC<PaymentStatusEditorProps> = ({ value, onChange, disabled }) => {
  return (
    <div className="flex items-center gap-2">
      <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="min-w-[110px]">
          <SelectValue placeholder="選擇款項狀態" />
        </SelectTrigger>
        <SelectContent>
          {paymentStatusOptions.map(option => (
            <SelectItem key={option} value={option}>
              <PaymentStatusBadge status={option} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default PaymentStatusEditor;
