import React, { createContext, useContext } from 'react';

interface UserContextType {
  userId: string | null;
  onLogout: () => void;
  onSwitchToCompany: () => void;
}

const UserContext = createContext<UserContextType>({
  userId: null,
  onLogout: () => {},
  onSwitchToCompany: () => {},
});

export function UserProvider({
  userId,
  onLogout,
  onSwitchToCompany,
  children,
}: {
  userId: string | null;
  onLogout: () => void;
  onSwitchToCompany: () => void;
  children: React.ReactNode;
}) {
  return (
    <UserContext.Provider value={{ userId, onLogout, onSwitchToCompany }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
