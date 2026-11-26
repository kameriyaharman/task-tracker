import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { dmy, ymd } from './format';

type Ev = { target: { value: string } };
/**
 * Date box that shows and accepts DD-MM-YYYY (type it, or tap 📅 for a calendar).
 * Drop-in for <input type="date">: value / onChange still use YYYY-MM-DD.
 */
export function DateInput({ value, onChange, min, max, className, style, placeholder = 'DD-MM-YYYY', withTime }: {
  value?: string | null; onChange: (e: Ev) => void; min?: string; max?: string; className?: string; style?: CSSProperties; placeholder?: string; withTime?: boolean;
}) {
  const v = value ?? '';
  const datePart = v.slice(0, 10), timePart = withTime ? v.slice(11, 16) : '';
  const show = (s: string) => (s ? dmy(s) : '');
  const [txt, setTxt] = useState(show(datePart));
  const [bad, setBad] = useState('');
  const pick = useRef<HTMLInputElement>(null);
  useEffect(() => { setTxt(show(datePart)); setBad(''); }, [datePart]); // eslint-disable-line
  const emit = (d: string, t = timePart) => onChange({ target: { value: withTime ? (d ? `${d}T${t || '10:00'}` : '') : d } });
  const commit = () => {
    if (!txt.trim()) { if (datePart) emit(''); setBad(''); return; }
    const d = ymd(txt);
    if (!d) { setBad('Use DD-MM-YYYY'); return; }
    if (max && d > max) { setBad(`Not after ${dmy(max)}`); return; }
    if (min && d < min) { setBad(`Not before ${dmy(min)}`); return; }
    setBad(''); setTxt(dmy(d)); if (d !== datePart) emit(d);
  };
  return (
    <span className={`dmy-wrap${withTime ? ' with-time' : ''}`} style={style}>
      <input className={`${className ?? ''} dmy-text${bad ? ' bad' : ''}`} value={txt} placeholder={placeholder} inputMode="numeric"
        onChange={(e) => setTxt(e.target.value.replace(/[^\d\-/.]/g, '').slice(0, 10))} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} title={bad || 'DD-MM-YYYY'} />
      <button type="button" className="dmy-btn" tabIndex={-1} onClick={() => { try { pick.current?.showPicker(); } catch { pick.current?.click(); } }} aria-label="Calendar">📅</button>
      <input ref={pick} type="date" className="dmy-native" value={datePart} min={min} max={max} onChange={(e) => emit(e.target.value)} tabIndex={-1} aria-hidden />
      {withTime && <input type="time" className={`${className ?? ''} dmy-time`} value={timePart} onChange={(e) => datePart && emit(datePart, e.target.value)} />}
      {bad && <span className="dmy-err">{bad}</span>}
    </span>
  );
}
