// Amount in words for totalAmountToWord (port of the minvoice-hddt-sender
// helper that Minvoice accepted).

const DIGITS = [
  'không',
  'một',
  'hai',
  'ba',
  'bốn',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
];
const SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

export function numberToVietnameseCurrency(value: number): string {
  const amount = Math.round(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Số tiền không hợp lệ: ${value}`);
  }
  const words = toWords(amount);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} đồng`;
}

function toWords(amount: number): string {
  if (amount === 0) return 'không';
  const groups: number[] = [];
  for (let rest = amount; rest > 0; rest = Math.floor(rest / 1000)) {
    groups.push(rest % 1000);
  }
  const parts: string[] = [];
  for (let scale = groups.length - 1; scale >= 0; scale -= 1) {
    const group = groups[scale];
    if (group === 0) continue;
    const readZeroHundreds = parts.length > 0 && group < 100;
    parts.push(
      [groupWords(group, readZeroHundreds), SCALES[scale]]
        .filter(Boolean)
        .join(' '),
    );
  }
  return parts.join(' ');
}

function groupWords(group: number, readZeroHundreds: boolean): string {
  const hundreds = Math.floor(group / 100);
  const tens = Math.floor((group % 100) / 10);
  const ones = group % 10;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${DIGITS[hundreds]} trăm`);
  else if (readZeroHundreds && (tens > 0 || ones > 0)) parts.push('không trăm');

  if (tens === 0 && ones > 0) {
    parts.push(
      hundreds > 0 || readZeroHundreds ? `linh ${DIGITS[ones]}` : DIGITS[ones],
    );
  } else if (tens === 1) {
    parts.push('mười');
    if (ones === 5) parts.push('lăm');
    else if (ones > 0) parts.push(DIGITS[ones]);
  } else if (tens > 1) {
    parts.push(`${DIGITS[tens]} mươi`);
    if (ones === 1) parts.push('mốt');
    else if (ones === 5) parts.push('lăm');
    else if (ones > 0) parts.push(DIGITS[ones]);
  }
  return parts.join(' ');
}
