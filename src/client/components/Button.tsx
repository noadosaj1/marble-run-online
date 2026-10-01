import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { sound } from '../game/audio/sound';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  big?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', big, className = '', onClick, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`btn btn-${variant} ${big ? 'btn-big' : ''} ${className}`}
      onClick={(e) => {
        sound.play('click');
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}
