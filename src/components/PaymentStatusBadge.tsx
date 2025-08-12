import React from 'react';

interface PaymentStatusBadgeProps {
  status?: string;
}

const statusColorMap: Record<string, string> = {
  '未收費': 'bg-gray-300 text-gray-700 border-gray-400',
  '已收費': 'bg-green-100 text-green-700 border-green-400',
  '待轉帳': 'bg-yellow-100 text-yellow-700 border-yellow-400',
  '未全款': 'bg-red-100 text-red-700 border-red-400',
  '特殊': 'bg-purple-100 text-purple-700 border-purple-400',
  '': 'bg-gray-200 text-gray-400 border-gray-300',
};

const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({ status }) => {
  const color = statusColorMap[status || ''] || statusColorMap[''];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs border font-medium ${color}`}
      style={{ minWidth: 48, textAlign: 'center' }}
    >
      {status || '-'}
    </span>
  );
};

export default PaymentStatusBadge;
