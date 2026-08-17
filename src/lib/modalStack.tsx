import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

interface ModalStackContextType {
  register: (id: string) => void;
  unregister: (id: string) => void;
  getIndex: (id: string) => number;
}

const ModalStackContext = createContext<ModalStackContextType | null>(null);

export const ModalStackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stack, setStack] = useState<string[]>([]);

  const register = useCallback((id: string) => {
    setStack((prev) => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setStack((prev) => prev.filter((item) => item !== id));
  }, []);

  const getIndex = useCallback((id: string) => {
    return stack.indexOf(id);
  }, [stack]);

  return (
    <ModalStackContext.Provider value={{ register, unregister, getIndex }}>
      {children}
    </ModalStackContext.Provider>
  );
};

export function useModalLayer(isOpen: boolean): number {
  const context = useContext(ModalStackContext);
  if (!context) {
    throw new Error('useModalLayer must be used within a ModalStackProvider');
  }

  const idRef = useRef<string>(Math.random().toString(36).substring(2, 9));
  const { register, unregister, getIndex } = context;

  useEffect(() => {
    const id = idRef.current;
    if (isOpen) {
      register(id);
    } else {
      unregister(id);
    }
    return () => {
      unregister(id);
    };
  }, [isOpen, register, unregister]);

  const index = getIndex(idRef.current);
  return index >= 0 ? 50 + index * 10 : 50;
}
