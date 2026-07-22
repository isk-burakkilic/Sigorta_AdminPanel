// Lightweight toast system: a module-level store + <Toaster/> renderer.
import { useEffect, useState } from 'react';

let seq = 0;
const listeners = new Set();
let items = [];

function emit() { listeners.forEach((l) => l([...items])); }

export function toast(message, type = 'info', ttl = 3500) {
  const id = ++seq;
  items = [...items, { id, message, type }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, ttl);
}

export function Toaster() {
  const [list, setList] = useState([]);
  useEffect(() => {
    listeners.add(setList);
    return () => listeners.delete(setList);
  }, []);
  return (
    <div className="toast-wrap">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.type === 'ok' ? 'ok' : t.type === 'err' ? 'err' : 'info'}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
