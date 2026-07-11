import { useState, useEffect } from 'react';

export function useCurrencyConverter() {
  const [currency, setCurrency] = useState<string>('INR');
  const [rate, setRate] = useState<number>(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        // Fetch user currency
        let targetCurrency = 'INR';
        try {
          const curRes = await fetch('https://ipapi.co/currency/');
          if (curRes.ok) {
            const text = await curRes.text();
            if (text && text.trim().length === 3) {
              targetCurrency = text.trim().toUpperCase();
            }
          }
        } catch {
          // If adblocker blocks ipapi, fallback to checking timezone
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (tz && !tz.includes('Asia/Calcutta') && !tz.includes('Asia/Kolkata')) {
            targetCurrency = 'USD'; // default to USD for international
          }
        }
        
        if (targetCurrency === 'INR') {
          setCurrency('INR');
          setRate(1);
          setLoading(false);
          return;
        }

        // Fetch exchange rates
        const rateRes = await fetch('https://open.er-api.com/v6/latest/INR');
        if (rateRes.ok) {
          const data = await rateRes.json();
          if (data?.rates?.[targetCurrency]) {
            setCurrency(targetCurrency);
            setRate(data.rates[targetCurrency]);
          } else if (data?.rates?.USD) {
            setCurrency('USD');
            setRate(data.rates.USD);
          }
        }
      } catch (err) {
        console.error('Currency conversion error', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const formatAmount = (inr: number, period?: string): string => {
    if (inr === 0) return 'Free';
    const converted = inr * rate;
    const formatted = new Intl.NumberFormat(undefined, { 
      style: 'currency', 
      currency: currency, 
      maximumFractionDigits: currency === 'INR' ? 0 : 2 
    }).format(converted);
    
    if (period) {
      return `${formatted}/${period === 'yearly' ? 'yr' : 'mo'}`;
    }
    return formatted;
  };

  return { currency, rate, formatAmount, loading };
}
